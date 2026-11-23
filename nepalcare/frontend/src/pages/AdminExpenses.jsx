import { useEffect, useState } from 'react';
import { CheckCircle, Download, Eye, RefreshCw, XCircle } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function AdminExpenses() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [publicDescription, setPublicDescription] = useState('');
  const [publishToPublic, setPublishToPublic] = useState(false);
  const [publishReceipt, setPublishReceipt] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewName, setPreviewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const canReview = user?.adminLevel === 'MAIN_ADMIN' || user?.permissions?.includes('expense.review');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/relief/expenses/admin/queue');
      setItems(data.data.items);
      setSelected((current) => current && data.data.items.find((item) => item._id === current._id) || null);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load expenses awaiting review.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const openFile = async (expense, fileId, download = false) => {
    setError('');
    try {
      const { data } = await api.get(`/relief/expenses/${expense._id}/files/${fileId}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      if (download) {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileId === 'receipt' ? expense.receipt.originalName : expense.documents.find((file) => file._id === fileId)?.originalName || 'expense-document';
        link.click();
        URL.revokeObjectURL(url);
      } else {
        setPreviewUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return url;
        });
        setPreviewName(fileId === 'receipt' ? expense.receipt.originalName : expense.documents.find((file) => file._id === fileId)?.originalName || 'Expense document');
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Could not open this expense document.');
    }
  };

  const review = async (status) => {
    if (!selected) return;
    if (status !== 'APPROVED' && !reviewNote.trim()) {
      setError('A reason is required to reject an expense or request more information.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api.patch(`/relief/expenses/${selected._id}/review`, {
        status,
        reviewNote,
        publicDescription,
        publishToPublic,
        publishReceipt: publishToPublic && publishReceipt
      });
      setSuccess(status === 'APPROVED' ? 'Expense approved.' :
        status === 'REJECTED' ? 'Expense rejected.' : 'Additional documentation requested.');
      setReviewNote('');
      setPublicDescription('');
      setPublishToPublic(false);
      setPublishReceipt(false);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Expense review failed.');
    } finally {
      setBusy(false);
    }
  };

  const grouped = items.reduce((groups, expense) => {
    const key = expense.campaign?._id || 'unknown';
    if (!groups[key]) groups[key] = { title: expense.campaign?.title || 'Campaign', expenses: [] };
    groups[key].expenses.push(expense);
    return groups;
  }, {});

  return <main className="dashboard-page"><div className="container">
    <div className="dashboard-head"><div><span className="section-kicker">ADMIN CONSOLE</span><h1>Campaign expense verification</h1><p>Only approved expenses contribute to public fund utilization.</p></div>
      <button className="btn btn-outline" onClick={load} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
    {error && <div className="notice error">{error}</div>}
    {success && <div className="notice">{success}</div>}
    {!canReview && <div className="notice">Your account does not have expense review permission.</div>}
    {loading ? <div className="loading-state">Loading expense reviews…</div> : !items.length
      ? <div className="empty-campaigns"><h3>No expenses awaiting review</h3><p>Submitted expenses will appear here.</p></div>
      : <div className="review-layout">
        <div className="review-list">{Object.entries(grouped).map(([id, group]) => <section key={id} className="expense-review-group">
          <h3>{group.title}</h3>
          {group.expenses.map((expense) => <button type="button" className={`review-card ${selected?._id === expense._id ? 'active' : ''}`} key={expense._id} onClick={() => {
            setSelected(expense);
            setReviewNote(expense.reviewNote || '');
            setPublicDescription(expense.publicDescription || '');
          }}>
            <b>{expense.title}</b><small>{expense.ngo?.organizationName} · NPR {Number(expense.amount).toLocaleString('en-NP')}</small><span className="status-badge">{expense.status}</span>
          </button>)}
        </section>)}</div>
        <section className="dashboard-panel review-detail">
          {!selected ? <div className="empty-detail">Select an expense to review.</div> : <>
            <div className="panel-heading"><div><h2>{selected.title}</h2><p>{selected.campaign?.title} · {selected.ngo?.organizationName}</p></div><span className="status-badge">{selected.status}</span></div>
            <dl className="detail-grid">
              <dt>Category</dt><dd>{selected.category}</dd><dt>Amount</dt><dd>NPR {Number(selected.amount).toLocaleString('en-NP')}</dd>
              <dt>Date</dt><dd>{new Date(selected.expenseDate).toLocaleDateString()}</dd><dt>Vendor</dt><dd>{selected.vendorName || 'Not provided'}</dd>
              <dt>Description</dt><dd>{selected.description || selected.notes || '—'}</dd>
            </dl>
            {selected.receipt && <div className="document-row"><div><b>{selected.receipt.originalName}</b><small>{selected.receipt.mimeType} · {Math.ceil(selected.receipt.size / 1024)} KB</small></div>
              <div className="document-actions"><button className="btn btn-ghost btn-small" type="button" onClick={() => openFile(selected, 'receipt')}><Eye size={15}/> Preview</button><button className="btn btn-ghost btn-small" type="button" onClick={() => openFile(selected, 'receipt', true)}><Download size={15}/> Download</button></div>
            </div>}
            {selected.documents?.map((file) => <div className="document-row" key={file._id}><div><b>{file.originalName}</b><small>{file.mimeType}</small></div><button className="btn btn-ghost btn-small" type="button" onClick={() => openFile(selected, file._id, true)}><Download size={15}/> Download</button></div>)}
            <label className="field-label">Review note / rejection reason<textarea rows={3} maxLength={1000} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)}/></label>
            <label className="field-label">Public description (optional)<textarea rows={2} maxLength={1000} value={publicDescription} onChange={(event) => setPublicDescription(event.target.value)}/></label>
            <label className="expense-publish-toggle"><input type="checkbox" checked={publishToPublic} onChange={(event) => setPublishToPublic(event.target.checked)}/> Publish expense details in campaign transparency</label>
            <label className="expense-publish-toggle"><input type="checkbox" checked={publishReceipt} disabled={!publishToPublic} onChange={(event) => setPublishReceipt(event.target.checked)}/> Allow public access to this receipt</label>
            <div className="review-actions">
              <button className="btn" type="button" disabled={!canReview || busy} onClick={() => review('APPROVED')}><CheckCircle size={16}/> Approve</button>
              <button className="btn btn-danger" type="button" disabled={!canReview || busy} onClick={() => review('REJECTED')}><XCircle size={16}/> Reject</button>
              <button className="btn btn-ghost" type="button" disabled={!canReview || busy} onClick={() => review('NEEDS_MORE_INFORMATION')}>Request more information</button>
            </div>
          </>}
        </section>
      </div>}
    {previewUrl && <div className="modal-backdrop" role="presentation" onClick={() => setPreviewUrl('')}>
      <section className="confirmation-modal expense-preview-modal" role="dialog" aria-modal="true" aria-label="Expense receipt preview" onClick={(event) => event.stopPropagation()}>
        <div className="panel-heading"><h2>{previewName}</h2><button className="btn btn-ghost btn-small" type="button" onClick={() => setPreviewUrl('')}>Close</button></div>
        {previewName.toLowerCase().endsWith('.pdf') ? <iframe title={previewName} src={previewUrl}/> : <img src={previewUrl} alt={previewName}/>}
      </section>
    </div>}
  </div></main>;
}
