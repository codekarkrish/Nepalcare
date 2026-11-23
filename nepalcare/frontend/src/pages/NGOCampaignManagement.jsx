import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Download, Eye, FileText, HeartHandshake, MapPin, Plus, Users } from 'lucide-react';
import api from '../services/api';
import './CampaignWorkflows.css';

function formatNPR(value) {
  return `NPR ${Number(value || 0).toLocaleString('en-NP', { maximumFractionDigits: 2 })}`;
}

export function CampaignImage({ campaign, kind, value, alt }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setSrc('');
    if (!value) return () => { active = false; };
    if (/^https?:\/\//i.test(value)) {
      setSrc(value);
      return () => { active = false; };
    }
    api.get(`/campaigns/ngo/${campaign._id}/images/${kind}`, { responseType: 'blob' })
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data);
        if (active) setSrc(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (active) setSrc('');
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [campaign._id, kind, value]);
  return src ? <img src={src} alt={alt}/> : <div className="campaign-image-fallback">Campaign image unavailable</div>;
}

function EmptySection({ children }) {
  return <p className="muted">{children}</p>;
}

function PrivateActivityPhoto({ activityId, fileId, alt }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    api.get(`/relief/activities/${activityId}/files/${fileId}`, { responseType: 'blob' })
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data);
        if (active) setSrc(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => { if (active) setSrc(''); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activityId, fileId]);
  return src ? <img src={src} alt={alt}/> : <div className="campaign-image-fallback">Update photo unavailable</div>;
}

export default function NGOCampaignManagement() {
  const { pathname } = useLocation();
  const campaignId = pathname.split('/').filter(Boolean).pop();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [expenseDocuments, setExpenseDocuments] = useState([]);
  const [resubmissionNotes, setResubmissionNotes] = useState({});
  const [resubmissionFiles, setResubmissionFiles] = useState({});
  const [expenseDraft, setExpenseDraft] = useState({
    title: '', category: 'FOOD', description: '', amount: '', expenseDate: new Date().toISOString().slice(0, 10), vendorName: '', invoiceReference: '', notes: ''
  });
  const [updateDraft, setUpdateDraft] = useState({
    title: '', description: '', location: '', activityDate: new Date().toISOString().slice(0, 10),
    beneficiaryCount: '0', publicSummary: '', relatedExpenses: []
  });
  const [updatePhotos, setUpdatePhotos] = useState([]);
  const [updateDocuments, setUpdateDocuments] = useState([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.get(`/campaigns/ngo/${campaignId}/management`)
      .then((response) => {
        if (active) setData(response.data.data);
      })
      .catch((e) => {
        if (active) setError(e.response?.data?.message || 'Could not load this campaign dashboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [campaignId, refresh]);

  const submitExpense = async (event) => {
    event.preventDefault();
    if (!receiptFile) {
      setActionError('Attach the required bill or receipt.');
      return;
    }
    const formData = new FormData();
    formData.append('campaignId', campaignId);
    Object.entries(expenseDraft).forEach(([key, value]) => formData.append(key, value));
    formData.append('receipt', receiptFile);
    expenseDocuments.forEach((file) => formData.append('documents', file));
    setBusy(true);
    setActionError('');
    setActionSuccess('');
    try {
      await api.post('/relief/expenses', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setActionSuccess('Expense submitted for admin verification.');
      setExpenseDraft({ title: '', category: 'FOOD', description: '', amount: '', expenseDate: new Date().toISOString().slice(0, 10), vendorName: '', invoiceReference: '', notes: '' });
      setReceiptFile(null);
      setExpenseDocuments([]);
      setRefresh((value) => value + 1);
    } catch (e) {
      setActionError(e.response?.data?.message || 'Could not submit this expense.');
    } finally {
      setBusy(false);
    }
  };

  const submitUpdate = async (event) => {
    event.preventDefault();
    const formData = new FormData();
    formData.append('campaignId', campaignId);
    Object.entries(updateDraft).forEach(([key, value]) => {
      formData.append(key, key === 'relatedExpenses' ? JSON.stringify(value) : value);
    });
    updatePhotos.forEach((file) => formData.append('photos', file));
    updateDocuments.forEach((file) => formData.append('documents', file));
    setBusy(true);
    setActionError('');
    setActionSuccess('');
    try {
      await api.post('/relief/activities', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setActionSuccess('Campaign impact update published.');
      setUpdateDraft({ title: '', description: '', location: '', activityDate: new Date().toISOString().slice(0, 10), beneficiaryCount: '0', publicSummary: '', relatedExpenses: [] });
      setUpdatePhotos([]);
      setUpdateDocuments([]);
      setRefresh((value) => value + 1);
    } catch (e) {
      setActionError(e.response?.data?.message || 'Could not publish the campaign update.');
    } finally {
      setBusy(false);
    }
  };

  const openExpenseFile = async (expense, fileId, download = false) => {
    setActionError('');
    const previewWindow = download ? null : window.open('', '_blank');
    if (previewWindow) previewWindow.opener = null;
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
        if (!previewWindow) throw new Error('Allow pop-ups to preview this file, or use Download.');
        previewWindow.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (e) {
      if (previewWindow) previewWindow.close();
      setActionError(e.response?.data?.message || e.message || 'Could not open this expense file.');
    }
  };

  const downloadActivityFile = async (activity, file) => {
    setActionError('');
    try {
      const { data } = await api.get(`/relief/activities/${activity._id}/files/${file._id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.originalName || 'activity-document';
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setActionError(e.response?.data?.message || 'Could not download this activity document.');
    }
  };

  const resubmitExpense = async (event, expense) => {
    event.preventDefault();
    const formData = new FormData();
    if (resubmissionNotes[expense._id]?.trim()) formData.append('notes', resubmissionNotes[expense._id].trim());
    (resubmissionFiles[expense._id] || []).forEach((file) => formData.append('documents', file));
    setBusy(true);
    setActionError('');
    setActionSuccess('');
    try {
      await api.post(`/relief/expenses/${expense._id}/resubmit`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setActionSuccess('Additional information submitted; the expense is back in the admin review queue.');
      setResubmissionNotes((previous) => ({ ...previous, [expense._id]: '' }));
      setResubmissionFiles((previous) => ({ ...previous, [expense._id]: [] }));
      setRefresh((value) => value + 1);
    } catch (e) {
      setActionError(e.response?.data?.message || 'Could not resubmit expense information.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <main className="dashboard-page"><div className="container loading-state">Loading campaign dashboard…</div></main>;
  if (error) return <main className="dashboard-page"><div className="container"><div className="notice error">{error}</div><Link className="text-link" to="/ngo/campaigns"><ArrowLeft size={16}/> My campaigns</Link></div></main>;
  if (!data) return null;

  const { campaign, financialSummary, donations, volunteers, expenses, activities } = data;
  const confirmedPercent = financialSummary.progressPercent;
  const latestDeletion = campaign.deletionRequests?.[campaign.deletionRequests.length - 1];

  return <main className="dashboard-page"><div className="container ngo-campaign-management">
    <Link className="text-link" to="/ngo/campaigns"><ArrowLeft size={16}/> My campaigns</Link>
    <div className="dashboard-head">
      <div>
        <span className="section-kicker">CAMPAIGN MANAGEMENT</span>
        <h1>{campaign.title}</h1>
        <p><MapPin size={15}/> {campaign.location} <span>·</span> {campaign.type} <span>·</span> {campaign.category}</p>
      </div>
      <div className="campaign-status-stack">
        <span className="status-badge">{campaign.status}</span>
        {campaign.status !== 'ARCHIVED' && <span className="status-badge">{campaign.publicationStatus || 'UNPUBLISHED'}</span>}
      </div>
    </div>
    {campaign.status === 'ARCHIVED' && <div className="notice">This campaign is archived and its financial and activity history is preserved.</div>}
    {actionError && <div className="notice error">{actionError}</div>}
    {actionSuccess && <div className="notice">{actionSuccess}</div>}
    {latestDeletion && <div className={`notice ${latestDeletion.status === 'REJECTED' ? 'error' : ''}`}>
      Deletion request: <b>{latestDeletion.status}</b> — {latestDeletion.reason}
      {latestDeletion.reviewNote && <span> Admin note: {latestDeletion.reviewNote}</span>}
    </div>}

    <nav className="campaign-section-nav" aria-label="Campaign dashboard sections">
      {[
        ['overview', 'Overview'],
        ['fundraising', 'Fundraising'],
        ['donations', 'Donations'],
        ['volunteers', 'Volunteers'],
        ['expenses', 'Expenses'],
        ['bills', 'Bills & Receipts'],
        ['relief', 'Relief Activities'],
        ['updates', 'Campaign Updates'],
        ['settings', 'Settings']
      ].map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}
    </nav>

    <section className="dashboard-panel management-section" id="overview">
      <div className="campaign-management-hero">
        {campaign.coverImage && <CampaignImage campaign={campaign} kind="cover" value={campaign.coverImage} alt={`${campaign.title} cover`}/>}
        <div>
          <h2>Overview</h2>
          <p>{campaign.description}</p>
          <div className="campaign-overview-facts">
            <span><CalendarDays size={16}/> {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : 'Start date not set'} – {campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : 'End date not set'}</span>
            <span><Users size={16}/> {financialSummary.volunteerSlotsFilled} / {campaign.requiredVolunteers ?? 5} volunteer spots accepted · {campaign.remainingVolunteerSlots ?? 0} open</span>
            <span><HeartHandshake size={16}/> {financialSummary.donorCount} confirmed donors</span>
          </div>
        </div>
        {campaign.requiredItems?.length > 0 && <div className="campaign-required-items">
          <h3>Physical item requirements</h3>
          <ul className="required-items-list">{campaign.requiredItems.map((item) => <li key={item._id}>
            <b>{item.name}</b><span>{item.category} · {item.receivedQuantity || 0} received of {item.requiredQuantity}</span><span>Accepted condition: {item.acceptedCondition}</span>
          </li>)}</ul>
          {campaign.collectionInstructions && <p>{campaign.collectionInstructions}</p>}
        </div>}
      </div>
    </section>

    <section className="dashboard-panel management-section" id="fundraising">
      <div className="panel-heading"><div><h2>Fundraising</h2><p>Only verified successful donations are included in confirmed totals.</p></div></div>
      <div className="stat-grid management-stat-grid">
        <div className="stat-card"><small>Fundraising goal</small><strong>{formatNPR(financialSummary.goal)}</strong></div>
        <div className="stat-card"><small>Confirmed amount raised</small><strong>{formatNPR(financialSummary.confirmedAmount)}</strong></div>
        <div className="stat-card"><small>Remaining to goal</small><strong>{formatNPR(Math.max(financialSummary.goal - financialSummary.confirmedAmount, 0))}</strong></div>
        <div className="stat-card"><small>Pending donations</small><strong>{financialSummary.pendingDonationCount} · {formatNPR(financialSummary.pendingAmount)}</strong></div>
      </div>
      <div className="progress-track"><span style={{ width: `${confirmedPercent}%` }}/></div>
      <small>{confirmedPercent.toFixed(1)}% of fundraising goal</small>
    </section>

    <section className="dashboard-panel management-section" id="donations">
      <div className="panel-heading"><div><h2>Donations</h2><p>{donations.length} recent donation records</p></div></div>
      {donations.length ? <div className="management-table-wrap"><table className="management-table">
        <thead><tr><th>Donor</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>{donations.map((donation) => <tr key={donation._id}>
          <td>{donation.citizen?.name || 'Citizen'}{donation.citizen?.email && <small>{donation.citizen.email}</small>}</td>
          <td>{formatNPR(donation.amount)}</td>
          <td>{donation.provider?.replaceAll('_', ' ')}</td>
          <td><span className="status-badge">{donation.status}</span></td>
          <td>{new Date(donation.createdAt).toLocaleDateString()}</td>
        </tr>)}</tbody>
      </table></div> : <EmptySection>No donations have been recorded for this campaign.</EmptySection>}
    </section>

    <section className="dashboard-panel management-section" id="volunteers">
      <div className="panel-heading"><div><h2>Volunteers</h2><p>{financialSummary.volunteerSlotsFilled} accepted of {campaign.requiredVolunteers ?? 5} volunteer spots · {campaign.volunteerCapacityStatus || 'OPEN'}</p></div></div>
      {volunteers.length ? <div className="management-record-list">{volunteers.map((application) => <article className="management-record" key={application._id}>
        <div><b>{application.fullName || application.citizen?.name || 'Citizen'}</b><small>{application.email || application.citizen?.email || 'No email'}{application.phone || application.citizen?.phone ? ` · ${application.phone || application.citizen.phone}` : ''}</small><p>{application.message || 'No message provided.'}</p><small>Skills: {application.skills || 'Not provided'} · Availability: {application.availability || 'Not provided'} · Commitment: {application.commitmentHours || 'Not provided'}</small>{application.offer && <p>Offer: {application.offer.role} · {application.offer.expectedHours} · {application.status}</p>}</div>
        <div><span className="status-badge">{application.status}</span><small>{new Date(application.createdAt).toLocaleDateString()}</small></div>
      </article>)}</div> : <EmptySection>No volunteer applications have been received.</EmptySection>}
    </section>

    <section className="dashboard-panel management-section" id="expenses">
      <div className="panel-heading"><div><h2>Expenses</h2><p>Submit campaign spending with a required bill/receipt. Approved totals are shared publicly only after admin review.</p></div></div>
      <div className="stat-grid management-stat-grid">
        <div className="stat-card"><small>Expenses submitted</small><strong>{expenses.length}</strong></div>
        <div className="stat-card"><small>Total submitted</small><strong>{formatNPR(expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0))}</strong></div>
        <div className="stat-card"><small>Admin-approved</small><strong>{formatNPR(financialSummary.verifiedExpenses)}</strong></div>
        <div className="stat-card"><small>Pending review</small><strong>{expenses.filter((expense) => ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'].includes(expense.status)).length}</strong></div>
      </div>
      <form key={`expense-${refresh}`} className="campaign-form management-form" onSubmit={submitExpense}>
        <h3><Plus size={18}/> Submit a campaign expense</h3>
        <div className="form-grid">
          <label>Expense title<input required maxLength={160} value={expenseDraft.title} onChange={(event) => setExpenseDraft({ ...expenseDraft, title: event.target.value })}/></label>
          <label>Category<select value={expenseDraft.category} onChange={(event) => setExpenseDraft({ ...expenseDraft, category: event.target.value })}>
            {['FOOD', 'MEDICAL', 'TRANSPORT', 'SUPPLIES', 'EDUCATION', 'SHELTER', 'LOGISTICS', 'OTHER'].map((category) => <option key={category}>{category}</option>)}
          </select></label>
          <label>Amount (NPR)<input required type="number" min="0.01" max="1000000000" step="0.01" value={expenseDraft.amount} onChange={(event) => setExpenseDraft({ ...expenseDraft, amount: event.target.value })}/></label>
          <label>Expense date<input required type="date" value={expenseDraft.expenseDate} onChange={(event) => setExpenseDraft({ ...expenseDraft, expenseDate: event.target.value })}/></label>
          <label>Vendor / payee<input maxLength={160} value={expenseDraft.vendorName} onChange={(event) => setExpenseDraft({ ...expenseDraft, vendorName: event.target.value })}/></label>
          <label>Invoice reference<input maxLength={500} value={expenseDraft.invoiceReference || ''} onChange={(event) => setExpenseDraft({ ...expenseDraft, invoiceReference: event.target.value })}/></label>
          <label className="form-grid-wide">Description<textarea required maxLength={2000} rows="3" value={expenseDraft.description} onChange={(event) => setExpenseDraft({ ...expenseDraft, description: event.target.value })}/></label>
          <label className="form-grid-wide">Internal notes<textarea maxLength={2000} rows="2" value={expenseDraft.notes} onChange={(event) => setExpenseDraft({ ...expenseDraft, notes: event.target.value })}/></label>
          <label>Bill / receipt (required)<input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setReceiptFile(event.target.files?.[0] || null)}/></label>
          <label>Additional supporting documents<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setExpenseDocuments(Array.from(event.target.files || []))}/></label>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy || campaign.status === 'ARCHIVED'}>{busy ? 'Submitting…' : 'Submit expense for review'}</button>
      </form>
      {expenses.length ? <div className="management-record-list">{expenses.map((expense) => <article className="management-record" key={expense._id}>
        <div>
          <b>{expense.title}</b><small>{expense.category} · {new Date(expense.expenseDate).toLocaleDateString()}{expense.vendorName ? ` · ${expense.vendorName}` : ''}</small>
          <p>{expense.description || expense.notes || 'No description provided.'}</p>
          {expense.reviewNote && <p className="notice error">Admin feedback: {expense.reviewNote}</p>}
          {expense.receipt && <div className="file-action-row">
            <button type="button" className="text-link" onClick={() => openExpenseFile(expense, 'receipt')}><Eye size={16}/> View receipt</button>
            <button type="button" className="text-link" onClick={() => openExpenseFile(expense, 'receipt', true)}><Download size={16}/> Download receipt</button>
          </div>}
          {expense.documents?.map((file) => <button type="button" className="text-link" key={file._id} onClick={() => openExpenseFile(expense, file._id, true)}><Download size={16}/> {file.originalName}</button>)}
          {expense.status === 'NEEDS_MORE_INFORMATION' && <form key={`resubmit-${expense._id}-${refresh}`} className="campaign-form resubmission-form" onSubmit={(event) => resubmitExpense(event, expense)}>
            <h4>Provide the requested information</h4>
            <label>Response / updated expense details<textarea rows="2" value={resubmissionNotes[expense._id] || ''} onChange={(event) => setResubmissionNotes({ ...resubmissionNotes, [expense._id]: event.target.value })}/></label>
            <label>Additional documents<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setResubmissionFiles({ ...resubmissionFiles, [expense._id]: Array.from(event.target.files || []) })}/></label>
            <button className="btn btn-primary btn-small" type="submit" disabled={busy}>Resubmit for review</button>
          </form>}
        </div>
        <div><b>{formatNPR(expense.amount)}</b><span className="status-badge">{expense.status.replaceAll('_', ' ')}</span></div>
      </article>)}</div> : <EmptySection>No expense records have been submitted.</EmptySection>}
    </section>

    <section className="dashboard-panel management-section" id="bills">
      <div className="panel-heading"><div><h2>Bills &amp; Receipts</h2><p>Private files are available only to your NGO and authorized administrators.</p></div></div>
      {expenses.some((expense) => expense.receipt || expense.invoiceReference) ? <div className="management-record-list">
        {expenses.filter((expense) => expense.receipt || expense.invoiceReference).map((expense) => <article className="management-record" key={expense._id}>
          <div><b>{expense.title}</b><small>{expense.invoiceReference || expense.receipt?.originalName || 'Receipt attached'} · {expense.status.replaceAll('_', ' ')}</small></div>
          <div>{expense.receipt && <><button type="button" className="text-link" onClick={() => openExpenseFile(expense, 'receipt')}><Eye size={16}/> View</button><button type="button" className="text-link" onClick={() => openExpenseFile(expense, 'receipt', true)}><Download size={16}/> Download</button></>}</div>
        </article>)}
      </div> : <EmptySection>No bills or receipts have been uploaded.</EmptySection>}
    </section>

    <section className="dashboard-panel management-section" id="relief">
      <div className="panel-heading"><div><h2>Relief Activities</h2><p>Recorded campaign activity and beneficiary data. Add a public update below when ready to share impact.</p></div></div>
      {activities.length ? <div className="management-record-list">{activities.map((activity) => <article className="management-record" key={activity._id}>
        <div><b>{activity.title}</b><small>{activity.location} · {new Date(activity.activityDate).toLocaleDateString()}</small><p>{activity.description}</p></div>
        <div><span className="status-badge">{activity.status}</span><small>{activity.beneficiaryCount} beneficiaries</small></div>
        {activity.photos?.length > 0 && <div className="public-update-photos">{activity.photos.map((photo) => <PrivateActivityPhoto key={photo._id} activityId={activity._id} fileId={photo._id} alt={`${activity.title} photo`}/>)}</div>}
        {activity.documents?.map((file) => <button type="button" className="text-link" key={file._id} onClick={() => downloadActivityFile(activity, file)}><FileText size={16}/> {file.originalName}</button>)}
      </article>)}</div> : <EmptySection>No relief activities have been recorded.</EmptySection>}
    </section>

    <section className="dashboard-panel management-section" id="updates">
      <div className="panel-heading"><div><h2>Campaign Updates</h2><p>Public summaries and photos appear on this campaign’s public page.</p></div></div>
      <form key={`update-${refresh}`} className="campaign-form management-form" onSubmit={submitUpdate}>
        <h3><Plus size={18}/> Publish an impact update</h3>
        <div className="form-grid">
          <label>Update title<input required maxLength={160} value={updateDraft.title} onChange={(event) => setUpdateDraft({ ...updateDraft, title: event.target.value })}/></label>
          <label>Activity date<input required type="date" value={updateDraft.activityDate} onChange={(event) => setUpdateDraft({ ...updateDraft, activityDate: event.target.value })}/></label>
          <label>Location<input required maxLength={200} value={updateDraft.location} onChange={(event) => setUpdateDraft({ ...updateDraft, location: event.target.value })}/></label>
          <label>Beneficiaries reached<input required type="number" min="0" step="1" value={updateDraft.beneficiaryCount} onChange={(event) => setUpdateDraft({ ...updateDraft, beneficiaryCount: event.target.value })}/></label>
          <label className="form-grid-wide">Activity details (internal record)<textarea required maxLength={3000} rows="3" value={updateDraft.description} onChange={(event) => setUpdateDraft({ ...updateDraft, description: event.target.value })}/></label>
          <label className="form-grid-wide">Public summary<textarea required maxLength={2000} rows="3" value={updateDraft.publicSummary} onChange={(event) => setUpdateDraft({ ...updateDraft, publicSummary: event.target.value })}/></label>
          <label className="form-grid-wide">Link approved expenses (optional)<select multiple value={updateDraft.relatedExpenses} onChange={(event) => setUpdateDraft({ ...updateDraft, relatedExpenses: Array.from(event.target.selectedOptions, (option) => option.value) })}>
            {expenses.filter((expense) => ['APPROVED', 'VERIFIED'].includes(expense.status)).map((expense) => <option key={expense._id} value={expense._id}>{expense.title} · {formatNPR(expense.amount)}</option>)}
          </select></label>
          <label>Photos (up to 8)<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => setUpdatePhotos(Array.from(event.target.files || []))}/></label>
          <label>Supporting documents (up to 5)<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setUpdateDocuments(Array.from(event.target.files || []))}/></label>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy || campaign.status === 'ARCHIVED'}>{busy ? 'Publishing…' : 'Publish campaign update'}</button>
      </form>
      {activities.some((activity) => activity.publicSummary) ? <div className="management-record-list">
        {activities.filter((activity) => activity.publicSummary).map((activity) => <article className="management-record" key={activity._id}>
          <div><b>{activity.title}</b><small>{new Date(activity.activityDate).toLocaleDateString()}</small><p>{activity.publicSummary}</p></div>
          {activity.photos?.length > 0 && <div className="public-update-photos">{activity.photos.map((photo) => <PrivateActivityPhoto key={photo._id} activityId={activity._id} fileId={photo._id} alt={`${activity.title} photo`}/>)}</div>}
          <span className="status-badge">{activity.status}</span>
        </article>)}
      </div> : <EmptySection>No public activity summaries have been recorded.</EmptySection>}
    </section>

    <section className="dashboard-panel management-section" id="settings">
      <div className="panel-heading"><div><h2>Settings</h2><p>Campaign configuration and current review state.</p></div></div>
      <dl className="detail-grid">
        <dt>Campaign type</dt><dd>{campaign.type}</dd>
        <dt>Review status</dt><dd>{campaign.reviewStatus || campaign.status}</dd>
        <dt>Publication status</dt><dd>{campaign.publicationStatus || 'UNPUBLISHED'}</dd>
        <dt>Campaign location</dt><dd>{campaign.location}</dd>
        {campaign.status === 'ARCHIVED' && <><dt>Archived at</dt><dd>{campaign.archivedAt ? new Date(campaign.archivedAt).toLocaleString() : '—'}</dd></>}
      </dl>
      <Link className="btn btn-ghost btn-small" to="/ngo/campaigns">Edit campaign in My Campaigns</Link>
    </section>
  </div></main>;
}
