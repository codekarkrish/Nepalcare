import { useEffect, useState } from 'react';
import { Activity, HeartHandshake, ShieldCheck, Users, ClipboardCheck, Plus, RefreshCw, Upload, CheckCircle, XCircle, RotateCcw, Eye, Download, Package } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import NGOCampaignManagement, { CampaignImage } from './NGOCampaignManagement';
import DonorDashboard from './DonorDashboard';
import NGOVolunteerManagement from './NGOVolunteerManagement';
import NGOItemDonations from './NGOItemDonations';
import AdminExpenses from './AdminExpenses';

function Notice({ error, success }) {
  if (!error && !success) return null;
  return <div className={`notice ${error ? 'error' : ''}`}>{error || success}</div>;
}

function AdminNGOs() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [note, setNote] = useState('');
  const can = (permission) => user?.adminLevel === 'MAIN_ADMIN' || user?.permissions?.includes(permission);

  const load = async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('/ngos/admin/pending'); setItems(data.data.items); }
    catch (e) { setError(e.response?.data?.message || 'Could not load NGO applications.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const review = async (action) => {
    if (!selected) return;
    if ((action === 'reject' || action === 'resubmission') && !note.trim()) {
      setError('A review reason is required.');
      return;
    }
    setError(''); setSuccess('');
    try {
      const body = action === 'review' ? { status: 'UNDER_REVIEW', reviewNote: note } : { reviewNote: note };
      await api.patch(`/ngos/admin/${selected._id}/${action}`, body);
      setSuccess(action === 'approve' ? 'NGO approved.' : action === 'reject' ? 'NGO rejected.' : action === 'resubmission' ? 'Resubmission requested.' : 'NGO placed under review.');
      setNote(''); setSelected(null); await load();
    } catch (e) { setError(e.response?.data?.message || 'Review action failed.'); }
  };

  const openDocument = async (document, download = false) => {
    if (!selected) return;
    try {
      const { data } = await api.get(`/ngos/${selected._id}/documents/${document._id}/${download ? 'download' : 'preview'}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      if (download) { const a = document.createElement('a'); a.href = url; a.download = document.originalName; a.click(); URL.revokeObjectURL(url); }
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) { setError(e.response?.data?.message || 'Document access failed.'); }
  };

  return <main className="dashboard-page"><div className="container"><div className="dashboard-head"><div><span className="section-kicker">ADMIN CONSOLE</span><h1>NGO verification reviews</h1></div><button className="btn btn-outline" onClick={load}><RefreshCw size={16}/> Refresh</button></div><Notice error={error} success={success}/>
    {loading ? <div className="loading-state">Loading applications…</div> : items.length === 0 ? <div className="empty-campaigns"><h3>No pending NGO applications</h3><p>New verification submissions will appear here.</p></div> :
    <div className="review-layout"><div className="review-list">{items.map((ngo) => <button type="button" className={`review-card ${selected?._id===ngo._id?'active':''}`} key={ngo._id} onClick={() => { setSelected(ngo); setNote(ngo.reviewNote || ''); }}><b>{ngo.organizationName}</b><small>{ngo.registrationNumber}</small><span className="status-badge">{ngo.verificationStatus}</span></button>)}</div>
    <div className="dashboard-panel review-detail">{selected ? <><div className="panel-heading"><div><h2>{selected.organizationName}</h2><p>Submitted {selected.submittedAt ? new Date(selected.submittedAt).toLocaleString() : new Date(selected.createdAt).toLocaleString()}</p></div><span className="status-badge">{selected.verificationStatus}</span></div><dl className="detail-grid"><dt>Registration number</dt><dd>{selected.registrationNumber}</dd><dt>Address</dt><dd>{selected.address}</dd><dt>Description</dt><dd>{selected.description || 'No description provided.'}</dd></dl><h3>Verification documents</h3>{selected.documentReferences?.length ? <div className="document-list">{selected.documentReferences.map((doc) => <div className="document-row" key={doc._id}><div><b>{doc.originalName}</b><small>{doc.mimeType} · {Math.round(doc.size/1024)} KB</small></div>{can('ngo.documents.read') ? <div className="document-actions"><button className="btn btn-ghost btn-small" onClick={() => openDocument(doc)}><Eye size={15}/> Preview</button><button className="btn btn-ghost btn-small" onClick={() => openDocument(doc, true)}><Download size={15}/> Download</button></div> : <small>Document permission required</small>}</div>)}</div> : <p className="muted">No documents uploaded.</p>}<label className="field-label">Review note / reason<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}/></label><div className="review-actions">{can('ngo.approve')&&<button className="btn" onClick={() => review('approve')}><CheckCircle size={16}/> Approve</button>}{can('ngo.reject')&&<button className="btn btn-danger" onClick={() => review('reject')}><XCircle size={16}/> Reject</button>}{can('ngo.review')&&<><button className="btn btn-ghost" onClick={() => review('resubmission')}><RotateCcw size={16}/> Request resubmission</button><button className="btn btn-ghost" onClick={() => review('review')}><ShieldCheck size={16}/> Under review</button></>}</div></> : <div className="empty-detail">Select an application to review.</div>}</div></div>}</div></main>;
}

function AdminCampaigns() {
  const { user } = useAuth();
  const [items,setItems]=useState([]),[selected,setSelected]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState(''),[note,setNote]=useState('');
  const can=(p)=>user?.adminLevel==='MAIN_ADMIN'||user?.permissions?.includes(p);
  const load=async()=>{setLoading(true);setError('');try{const {data}=await api.get('/campaigns/admin/pending');setItems(data.data.items);}catch(e){setError(e.response?.data?.message||'Could not load campaign reviews.');}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  const review=async(action)=>{if(action==='reject'||action==='resubmission'){if(!note.trim()){setError('A reason is required.');return;}}setError('');try{await api.patch(`/campaigns/admin/${selected._id}/${action}`,{reviewNote:note});setSuccess(action==='approve'?'Campaign approved.':'Campaign review saved.');setSelected(null);setNote('');await load();}catch(e){setError(e.response?.data?.message||'Review failed.');}};
  return <main className="dashboard-page"><div className="container"><div className="dashboard-head"><div><span className="section-kicker">ADMIN CONSOLE</span><h1>Campaign reviews</h1></div><button className="btn btn-outline" onClick={load}><RefreshCw size={16}/> Refresh</button></div><Notice error={error} success={success}/>{loading?<div className="loading-state">Loading campaigns…</div>:items.length===0?<div className="empty-campaigns"><h3>No campaigns awaiting review</h3></div>:<div className="review-layout"><div className="review-list">{items.map(c=><button className={`review-card ${selected?._id===c._id?'active':''}`} key={c._id} onClick={()=>{setSelected(c);setNote(c.reviewNote||'');}}><b>{c.title}</b><small>{c.ngo?.organizationName||'Unknown NGO'}</small><span className="status-badge">{c.status}</span></button>)}</div><div className="dashboard-panel review-detail">{selected?<><div className="panel-heading"><div><h2>{selected.title}</h2><p>{selected.ngo?.organizationName}</p></div><span className="status-badge">{selected.status}</span></div><p className="review-description">{selected.description}</p><dl className="detail-grid"><dt>Fundraising goal</dt><dd>Rs. {Number(selected.targetAmount||0).toLocaleString()}</dd><dt>Category</dt><dd>{selected.category}</dd><dt>Location</dt><dd>{selected.location}</dd><dt>Submitted</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd></dl><label className="field-label">Review note / rejection reason<textarea value={note} onChange={e=>setNote(e.target.value)} rows={3}/></label><div className="review-actions">{can('campaign.approve')&&<button className="btn" onClick={()=>review('approve')}><CheckCircle size={16}/> Approve</button>}{can('campaign.reject')&&<button className="btn btn-danger" onClick={()=>review('reject')}><XCircle size={16}/> Reject</button>}{can('campaign.review')&&<button className="btn btn-ghost" onClick={()=>review('resubmission')}><RotateCcw size={16}/> Request resubmission</button>}</div></>:<div className="empty-detail">Select a campaign to review.</div>}</div></div>}</div></main>;
}

function TransferReviews() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState('');
  const canReview = user?.role === 'NGO' || user?.adminLevel === 'MAIN_ADMIN' ||
    user?.permissions?.includes('donation.review');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/donations/review-queue');
      setItems(data.data.items);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load transfer reviews.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openProof = async (item) => {
    setError('');
    try {
      const { data } = await api.get(`/donations/${item._id}/proof`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not open payment proof.');
    }
  };

  const review = async (item, status) => {
    const reviewNote = notes[item._id] || '';
    if (status === 'FAILED' && !reviewNote.trim()) {
      setError('Enter a reason before rejecting a transfer.');
      return;
    }
    setError('');
    setSuccess('');
    setBusyId(item._id);
    try {
      await api.patch(`/donations/${item._id}/review`, { status, reviewNote });
      setSuccess(status === 'SUCCESS' ? 'Transfer verified and donation confirmed.' : 'Transfer rejected.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Transfer review failed.');
    } finally {
      setBusyId('');
    }
  };

  return <main className="dashboard-page"><div className="container">
    <div className="dashboard-head">
      <div><span className="section-kicker">{user?.role === 'ADMIN' ? 'ADMIN CONSOLE' : 'NGO WORKSPACE'}</span><h1>Transfer verification</h1></div>
      <button className="btn btn-outline" onClick={load} disabled={loading}><RefreshCw size={16}/> Refresh</button>
    </div>
    <Notice error={error} success={success}/>
    {!canReview && <div className="notice">Your account does not have permission to verify transfers.</div>}
    {loading ? <div className="loading-state">Loading submitted transfers…</div> : items.length === 0
      ? <div className="empty-campaigns"><h3>No transfers awaiting verification</h3><p>Submitted bank and QR transfers will appear here.</p></div>
      : <div className="transfer-review-list">{items.map((item) => <article className="dashboard-panel transfer-review-card" key={item._id}>
        <div className="panel-heading">
          <div><h2>{item.campaign?.title || 'Campaign'}</h2><p>{item.campaign?.ngo?.organizationName || 'NGO'} · {item.provider.replace('_', ' ')}</p></div>
          <span className="status-badge">{item.status}</span>
        </div>
        <dl className="detail-grid">
          <dt>Donor</dt><dd>{item.citizen?.name || 'Citizen'}{item.citizen?.email ? ` · ${item.citizen.email}` : ''}</dd>
          <dt>Amount</dt><dd>NPR {Number(item.amount).toLocaleString('en-NP')}</dd>
          <dt>Transfer reference</dt><dd>{item.transferReference}</dd>
          <dt>Submitted</dt><dd>{new Date(item.updatedAt).toLocaleString()}</dd>
        </dl>
        {item.paymentProofName && <button className="btn btn-ghost btn-small" type="button" onClick={() => openProof(item)}><Eye size={15}/> View proof ({item.paymentProofName})</button>}
        <label className="field-label">Review note / rejection reason
          <textarea rows={2} maxLength={1000} value={notes[item._id] || ''} onChange={(e) => setNotes({ ...notes, [item._id]: e.target.value })}/>
        </label>
        <div className="review-actions">
          <button className="btn" type="button" disabled={!canReview || busyId === item._id} onClick={() => review(item, 'SUCCESS')}><CheckCircle size={16}/> Verify transfer</button>
          <button className="btn btn-danger" type="button" disabled={!canReview || busyId === item._id} onClick={() => review(item, 'FAILED')}><XCircle size={16}/> Reject transfer</button>
        </div>
      </article>)}</div>}
  </div></main>;
}

function NGODonations() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/campaigns/ngo/donations')
      .then(({ data }) => setItems(data.data.items))
      .catch((e) => setError(e.response?.data?.message || 'Could not load donations.'))
      .finally(() => setLoading(false));
  }, []);
  return <main className="dashboard-page"><div className="container">
    <div className="dashboard-head"><div><span className="section-kicker">NGO WORKSPACE</span><h1>Donations</h1><p>Donation records for campaigns owned by your organization.</p></div><Link className="btn btn-outline" to="/ngo/donations/review">Review pending bank / QR transfers</Link></div>
    <Notice error={error}/>
    {loading ? <div className="loading-state">Loading donations…</div> : items.length ? <div className="dashboard-panel management-table-wrap"><table className="management-table">
      <thead><tr><th>Campaign</th><th>Donor</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item._id}>
        <td><Link to={`/ngo/campaigns/${item.campaign?._id}`}>{item.campaign?.title || 'Campaign'}</Link></td>
        <td>{item.citizen?.name || 'Citizen'}<small>{item.citizen?.email || ''}</small></td>
        <td>NPR {Number(item.amount).toLocaleString('en-NP', { maximumFractionDigits: 2 })}</td>
        <td>{item.provider?.replaceAll('_', ' ')}</td>
        <td><span className="status-badge">{item.status}</span></td>
        <td>{new Date(item.createdAt).toLocaleDateString()}</td>
      </tr>)}</tbody>
    </table></div> : <div className="empty-campaigns"><h3>No donations yet</h3><p>Donation records for your campaigns will appear here.</p></div>}
  </div></main>;
}

function NGOVolunteers() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/volunteers/ngo')
      .then(({ data }) => setItems(data.data.items))
      .catch((e) => setError(e.response?.data?.message || 'Could not load volunteer applications.'))
      .finally(() => setLoading(false));
  }, []);
  return <main className="dashboard-page"><div className="container">
    <div className="dashboard-head"><div><span className="section-kicker">NGO WORKSPACE</span><h1>Volunteer Applications</h1><p>Applications submitted to your campaigns.</p></div></div>
    <Notice error={error}/>
    {loading ? <div className="loading-state">Loading volunteer applications…</div> : items.length ? <div className="dashboard-panel management-record-list">
      {items.map((item) => <article className="management-record" key={item._id}>
        <div><b>{item.citizen?.name || 'Citizen'}</b><small>{item.citizen?.email || 'No email'}{item.citizen?.phone ? ` · ${item.citizen.phone}` : ''}</small><p>{item.message || 'No message provided.'}</p></div>
        <div><b>{item.campaign?.title || 'Campaign'}</b><span className="status-badge">{item.status}</span><small>{new Date(item.createdAt).toLocaleDateString()}</small></div>
      </article>)}
    </div> : <div className="empty-campaigns"><h3>No volunteer applications yet</h3><p>Applications for your campaigns will appear here.</p></div>}
  </div></main>;
}

function NGOReports() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/campaigns/ngo/financial-summary')
      .then(({ data }) => setItems(data.data.items))
      .catch((e) => setError(e.response?.data?.message || 'Could not load financial reports.'))
      .finally(() => setLoading(false));
  }, []);
  return <main className="dashboard-page"><div className="container">
    <div className="dashboard-head"><div><span className="section-kicker">NGO WORKSPACE</span><h1>Financial Reports</h1><p>Confirmed totals use verified successful donations and verified expenses only.</p></div></div>
    <Notice error={error}/>
    {loading ? <div className="loading-state">Loading financial reports…</div> : items.length ? <div className="dashboard-panel management-table-wrap"><table className="management-table">
      <thead><tr><th>Campaign</th><th>Goal</th><th>Confirmed raised</th><th>Pending donations</th><th>Verified expenses</th><th>Balance</th><th>Progress</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.campaign._id}>
        <td><Link to={`/ngo/campaigns/${item.campaign._id}`}>{item.campaign.title}</Link><small>{item.campaign.status}</small></td>
        <td>NPR {Number(item.goal).toLocaleString('en-NP')}</td>
        <td>NPR {Number(item.confirmedAmount).toLocaleString('en-NP')}</td>
        <td>{item.pendingDonationCount} · NPR {Number(item.pendingAmount).toLocaleString('en-NP')}</td>
        <td>NPR {Number(item.verifiedExpenses).toLocaleString('en-NP')}</td>
        <td>NPR {Number(item.remainingBalance).toLocaleString('en-NP')}</td>
        <td>{Number(item.progressPercent).toFixed(1)}%</td>
      </tr>)}</tbody>
    </table></div> : <div className="empty-campaigns"><h3>No campaign reports yet</h3><p>Create a campaign to see its financial summary here.</p></div>}
  </div></main>;
}

function CampaignDeletionReviews() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const canReview = user?.adminLevel === 'MAIN_ADMIN' || user?.permissions?.includes('campaign.deletion.review');
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/campaigns/admin/deletion-requests');
      setItems(data.data.items);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load campaign deletion requests.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  const review = async (item, status) => {
    const reviewNote = notes[item._id] || '';
    if (status === 'REJECTED' && !reviewNote.trim()) {
      setError('Enter a reason before rejecting a deletion request.');
      return;
    }
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      await api.patch(`/campaigns/admin/deletion-requests/${item.campaign._id}/${item._id}`, { status, reviewNote });
      setSuccess(status === 'APPROVED' ? 'Campaign archived. Its history and records were preserved.' : 'Deletion request rejected.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Deletion request review failed.');
    } finally {
      setBusy(false);
    }
  };
  return <main className="dashboard-page"><div className="container">
    <div className="dashboard-head"><div><span className="section-kicker">ADMIN CONSOLE</span><h1>Campaign deletion requests</h1></div><button className="btn btn-outline" onClick={load} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
    <Notice error={error} success={success}/>
    {!canReview && <div className="notice">Your account does not have campaign deletion review permission.</div>}
    {loading ? <div className="loading-state">Loading deletion requests…</div> : items.length ? <div className="management-record-list">
      {items.map((item) => <article className="dashboard-panel management-record deletion-review-card" key={item._id}>
        <div><h2>{item.campaign.title}</h2><small>{item.ngo?.organizationName || 'NGO'} · requested by {item.requestedBy?.name || 'NGO'} · {new Date(item.requestedAt).toLocaleString()}</small><p>{item.reason}</p></div>
        <label className="field-label">Admin note / rejection reason<textarea rows={2} maxLength={1000} value={notes[item._id] || ''} onChange={(e) => setNotes({ ...notes, [item._id]: e.target.value })}/></label>
        <div className="review-actions">
          <button className="btn" disabled={!canReview || busy} onClick={() => review(item, 'APPROVED')}>Approve & archive</button>
          <button className="btn btn-danger" disabled={!canReview || busy} onClick={() => review(item, 'REJECTED')}>Reject request</button>
        </div>
      </article>)}
    </div> : <div className="empty-campaigns"><h3>No pending deletion requests</h3></div>}
  </div></main>;
}

function NGOProfile() {
  const [ngo,setNgo]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const [form,setForm]=useState({organizationName:'',registrationNumber:'',address:'',description:''});
  const [files,setFiles]=useState([]);
  const load=async()=>{setLoading(true);try{const {data}=await api.get('/ngos/me');setNgo(data.data.ngo);setForm({organizationName:data.data.ngo.organizationName||'',registrationNumber:data.data.ngo.registrationNumber||'',address:data.data.ngo.address||'',description:data.data.ngo.description||''});}catch(e){if(e.response?.status!==404)setError(e.response?.data?.message||'Could not load profile.');}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  const save=async(e)=>{e.preventDefault();setError('');setSuccess('');try{const {data}=ngo?await api.patch('/ngos/me',form):await api.post('/ngos',form);setNgo(data.data.ngo);setSuccess('Organization profile saved.');}catch(e){setError(e.response?.data?.message||'Could not save profile.');}};
  const upload=async(e)=>{e.preventDefault();if(!files.length)return setError('Select at least one document.');const fd=new FormData();for(const file of files)fd.append('documents',file);try{await api.post('/ngos/documents',fd,{headers:{'Content-Type':'multipart/form-data'}});setSuccess('Documents submitted. Verification status is now PENDING.');setFiles([]);await load();}catch(e){setError(e.response?.data?.message||'Document upload failed.');}};
  if(loading)return <main className="dashboard-page"><div className="loading-state">Loading organization…</div></main>;
  return <main className="dashboard-page"><div className="container"><div className="dashboard-head"><div><span className="section-kicker">NGO WORKSPACE</span><h1>Organization verification</h1></div><span className="status-badge">{ngo?.verificationStatus||'NOT_SUBMITTED'}</span></div><Notice error={error} success={success}/><div className="profile-layout"><div className="dashboard-panel"><h2>Organization details</h2><form className="auth-form" onSubmit={save}><label>Organization name<input required value={form.organizationName} onChange={e=>setForm({...form,organizationName:e.target.value})}/></label><label>Registration number<input required value={form.registrationNumber} onChange={e=>setForm({...form,registrationNumber:e.target.value})}/></label><label>Address<input required value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label><label>Description<textarea rows={4} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><button className="btn" type="submit">Save organization profile</button></form></div><div className="dashboard-panel"><h2>Verification documents</h2><p className="muted">Status: <b>{ngo?.verificationStatus||'NOT_SUBMITTED'}</b></p>{ngo?.reviewNote&&<div className="notice">{ngo.reviewNote}</div>}<form className="auth-form" onSubmit={upload}><label>PDF, JPG or PNG (maximum 5 files)<input type="file" multiple accept=".pdf,image/jpeg,image/png" onChange={e=>setFiles([...e.target.files])}/></label><button className="btn" type="submit" disabled={!ngo}><Upload size={16}/> Submit documents</button></form>{ngo?.documentReferences?.length>0&&<div className="document-list compact">{ngo.documentReferences.map(d=><div className="document-row" key={d._id}><div><b>{d.originalName}</b><small>{d.mimeType}</small></div></div>)}</div>}</div></div></div></main>;
}

function NGOCampaigns() {
  const categories = [
    ['FOOD', 'Food'],
    ['CLOTHES', 'Clothes'],
    ['BLANKETS', 'Blankets'],
    ['EDUCATION', 'Education'],
    ['BOOKS', 'Books'],
    ['STATIONERY', 'Stationery'],
    ['UTENSILS', 'Utensils'],
    ['MEDICAL', 'Medical'],
    ['DISASTER_RELIEF', 'Disaster relief'],
    ['FUNDRAISING', 'Fundraising'],
    ['OTHER', 'Other']
  ];
  const emptyItem = () => ({
    name: '',
    category: 'FOOD',
    requiredQuantity: '',
    acceptedCondition: 'ANY'
  });
  const emptyForm = () => ({
    type: 'MONEY',
    title: '',
    description: '',
    category: 'FUNDRAISING',
    location: '',
    coverImage: null,
    startDate: '',
    endDate: '',
    requiredVolunteers: '5',
    targetAmount: '',
    paymentDetails: {
      bankName: '',
      accountName: '',
      accountNumber: '',
      branch: '',
      qrImage: null
    },
    requiredItems: [],
    collectionInstructions: ''
  });
  const [ngo, setNgo] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [editingId, setEditingId] = useState('');
  const [deletionTarget, setDeletionTarget] = useState(null);
  const [deletionReason, setDeletionReason] = useState('');
  const [deletionSaving, setDeletionSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const includesMoney = ['MONEY', 'HYBRID'].includes(form.type);
  const includesItems = ['PHYSICAL', 'HYBRID'].includes(form.type);
  const editingCampaign = items.find((campaign) => campaign._id === editingId);
  const hasExistingQr = Boolean(editingCampaign?.paymentDetails?.qrImage || editingCampaign?.paymentDetails?.qrImageUrl);
  const qrUploadRequired = includesMoney && (!editingId || !hasExistingQr);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [ngoResponse, campaignResponse] = await Promise.all([
        api.get('/ngos/me'),
        api.get('/campaigns/ngo/mine')
      ]);
      setNgo(ngoResponse.data.data.ngo);
      setItems(campaignResponse.data.data.items);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load campaigns.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const updateItem = (index, key, value) => {
    setForm((current) => ({
      ...current,
      requiredItems: current.requiredItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item)
    }));
  };

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (includesItems && form.requiredItems.some((item) =>
      !item.name.trim() || !Number.isInteger(Number(item.requiredQuantity)) || Number(item.requiredQuantity) < 1
    )) {
      setError('Enter an item name and a positive whole-number quantity for every required item.');
      return;
    }
    if (includesMoney && !form.paymentDetails.qrImage && qrUploadRequired) {
      setError('Upload a QR image for every money or hybrid campaign.');
      return;
    }
    const images = [form.coverImage, includesMoney ? form.paymentDetails.qrImage : null].filter(Boolean);
    if (images.some((image) =>
      !['image/jpeg', 'image/png', 'image/webp'].includes(image.type) || image.size > 5 * 1024 * 1024
    )) {
      setError('Campaign images must be JPG, PNG or WebP files no larger than 5 MB each.');
      return;
    }
    setSaving(true);
    try {
      const payload = new FormData();
      payload.append('type', form.type);
      payload.append('title', form.title);
      payload.append('description', form.description);
      payload.append('category', form.category);
      payload.append('location', form.location);
      payload.append('startDate', form.startDate);
      payload.append('endDate', form.endDate);
      payload.append('requiredVolunteers', String(Number(form.requiredVolunteers || 0)));
      payload.append('targetAmount', includesMoney ? String(Number(form.targetAmount)) : '0');
      payload.append('paymentDetails', JSON.stringify({
        bankName: form.paymentDetails.bankName,
        accountName: form.paymentDetails.accountName,
        accountNumber: form.paymentDetails.accountNumber,
        branch: form.paymentDetails.branch
      }));
      payload.append('requiredItems', JSON.stringify(includesItems
        ? form.requiredItems.map((item) => ({
          ...item,
          requiredQuantity: Number(item.requiredQuantity)
        }))
        : []));
      payload.append('collectionInstructions', form.collectionInstructions);
      if (form.coverImage) payload.append('coverImage', form.coverImage);
      if (includesMoney && form.paymentDetails.qrImage) payload.append('qrImage', form.paymentDetails.qrImage);
      const request = editingId
        ? api.patch(`/campaigns/${editingId}`, payload, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        : api.post('/campaigns', payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await request;
      setForm(emptyForm());
      setEditingId('');
      setFileInputKey((key) => key + 1);
      setSuccess(editingId ? 'Campaign updated.' : 'Campaign draft created. Submit it for admin review when ready.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Campaign creation failed.');
    } finally {
      setSaving(false);
    }
  };

  const submit = async (id) => {
    setError('');
    setSuccess('');
    try {
      await api.post(`/campaigns/${id}/submit`);
      setSuccess('Campaign submitted for review.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Submission failed.');
    }
  };

  const edit = (campaign) => {
    setError('');
    setSuccess('');
    setEditingId(campaign._id);
    setForm({
      type: campaign.type || 'MONEY',
      title: campaign.title || '',
      description: campaign.description || '',
      category: campaign.category || 'FUNDRAISING',
      location: campaign.location || '',
      coverImage: null,
      startDate: campaign.startDate ? new Date(campaign.startDate).toISOString().slice(0, 10) : '',
      endDate: campaign.endDate ? new Date(campaign.endDate).toISOString().slice(0, 10) : '',
      requiredVolunteers: String(campaign.requiredVolunteers ?? 5),
      targetAmount: campaign.targetAmount ? String(campaign.targetAmount) : '',
      paymentDetails: {
        bankName: campaign.paymentDetails?.bankName || '',
        accountName: campaign.paymentDetails?.accountName || '',
        accountNumber: campaign.paymentDetails?.accountNumber || '',
        branch: campaign.paymentDetails?.branch || '',
        qrImage: null
      },
      requiredItems: campaign.requiredItems?.map((item) => ({
        ...item,
        requiredQuantity: String(item.requiredQuantity)
      })) || [],
      collectionInstructions: campaign.collectionInstructions || ''
    });
    setFileInputKey((key) => key + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const requestDeletion = async (event) => {
    event.preventDefault();
    if (!deletionTarget || deletionReason.trim().length < 5) {
      setError('Provide a deletion reason of at least five characters.');
      return;
    }
    setDeletionSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/campaigns/${deletionTarget._id}/deletion-requests`, { reason: deletionReason.trim() });
      setSuccess('Deletion request submitted for administrator review. The campaign remains available until a decision is made.');
      setDeletionTarget(null);
      setDeletionReason('');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Could not submit the deletion request.');
    } finally {
      setDeletionSaving(false);
    }
  };

  return <main className="dashboard-page"><div className="container">
    <div className="dashboard-head">
      <div><span className="section-kicker">NGO WORKSPACE</span><h1>Campaigns</h1></div>
      <span className="status-badge">{ngo?.verificationStatus || 'NOT_SUBMITTED'}</span>
    </div>
    <Notice error={error} success={success}/>
    {ngo?.verificationStatus !== 'VERIFIED' && <div className="notice">Campaign creation and submission require a VERIFIED NGO profile.</div>}
    <div className="profile-layout">
      <div className="dashboard-panel">
        <h2>{editingId ? 'Edit campaign' : 'Create campaign'}</h2>
        <form className="auth-form" onSubmit={create}>
          <label>Campaign type
            <select required value={form.type} onChange={(e) => setForm({
              ...form,
              type: e.target.value,
              requiredItems: ['PHYSICAL', 'HYBRID'].includes(e.target.value)
                ? (form.requiredItems.length ? form.requiredItems : [emptyItem()])
                : form.requiredItems
            })}>
              <option value="MONEY">Money donation</option>
              <option value="PHYSICAL">Physical / item donation</option>
              <option value="HYBRID">Money and physical items</option>
            </select>
          </label>
          <label>Title<input required maxLength="160" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}/></label>
          <label>Description<textarea required maxLength="5000" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/></label>
          <label>Category
            <select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label>Location<input required maxLength="200" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}/></label>
          <label>Campaign cover image (optional, JPG/PNG/WebP; up to 5 MB)<input key={`cover-${fileInputKey}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setForm({ ...form, coverImage: e.target.files?.[0] || null })}/></label>
          <label>Campaign start date<input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}/></label>
          <label>Campaign end date<input required type="date" min={form.startDate || undefined} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}/></label>
          <label>Volunteer slots<input type="number" min="0" max="10000" step="1" value={form.requiredVolunteers} onChange={(e) => setForm({ ...form, requiredVolunteers: e.target.value })}/></label>
          {includesMoney && <>
            <label>Fundraising goal (NPR)<input required type="number" min="1" step="1" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}/></label>
            <fieldset className="item-requirements">
              <legend>Bank details and required QR payment image</legend>
              <p className="muted">These details will be visible to donors only after the campaign is approved.</p>
              <label>Bank name<input maxLength="120" value={form.paymentDetails.bankName} onChange={(e) => setForm({ ...form, paymentDetails: { ...form.paymentDetails, bankName: e.target.value } })}/></label>
              <label>Account name<input maxLength="160" value={form.paymentDetails.accountName} onChange={(e) => setForm({ ...form, paymentDetails: { ...form.paymentDetails, accountName: e.target.value } })}/></label>
              <label>Account number<input maxLength="80" value={form.paymentDetails.accountNumber} onChange={(e) => setForm({ ...form, paymentDetails: { ...form.paymentDetails, accountNumber: e.target.value } })}/></label>
              <label>Branch (optional)<input maxLength="120" value={form.paymentDetails.branch} onChange={(e) => setForm({ ...form, paymentDetails: { ...form.paymentDetails, branch: e.target.value } })}/></label>
              <label>QR payment image ({qrUploadRequired ? 'required' : 'optional replacement'}; JPG/PNG/WebP, up to 5 MB)<input key={`qr-${fileInputKey}`} required={qrUploadRequired} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setForm({ ...form, paymentDetails: { ...form.paymentDetails, qrImage: e.target.files?.[0] || null } })}/></label>
            </fieldset>
          </>}
          {includesItems && <fieldset className="item-requirements">
            <legend>Required physical items</legend>
            {form.requiredItems.map((item, index) => <div className="required-item-form" key={index}>
              <label>Item name<input required maxLength="120" value={item.name} onChange={(e) => updateItem(index, 'name', e.target.value)}/></label>
              <label>Item category<select required value={item.category} onChange={(e) => updateItem(index, 'category', e.target.value)}>{categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label>Quantity required<input required type="number" min="1" step="1" value={item.requiredQuantity} onChange={(e) => updateItem(index, 'requiredQuantity', e.target.value)}/></label>
              <label>Accepted condition<select required value={item.acceptedCondition} onChange={(e) => updateItem(index, 'acceptedCondition', e.target.value)}><option value="ANY">Any acceptable condition</option><option value="NEW">New</option><option value="LIKE_NEW">Like new</option><option value="GOOD">Good</option></select></label>
              {form.requiredItems.length > 1 && <button className="btn btn-ghost btn-small" type="button" onClick={() => setForm({ ...form, requiredItems: form.requiredItems.filter((_, itemIndex) => itemIndex !== index) })}>Remove item</button>}
            </div>)}
            <button className="btn btn-ghost btn-small" type="button" onClick={() => setForm({ ...form, requiredItems: [...form.requiredItems, emptyItem()] })}><Plus size={15}/> Add item</button>
          </fieldset>}
          {includesItems && <label>Collection instructions<textarea required maxLength="2000" rows={3} value={form.collectionInstructions} onChange={(e) => setForm({ ...form, collectionInstructions: e.target.value })} placeholder="Tell donors where and how items can be delivered."/></label>}
          <div className="campaign-form-actions">
            <button className="btn" disabled={saving || !ngo || ngo.verificationStatus !== 'VERIFIED'} type="submit"><Plus size={16}/>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create draft'}</button>
            {editingId && <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => { setEditingId(''); setForm(emptyForm()); setFileInputKey((key) => key + 1); }}>Cancel edit</button>}
          </div>
        </form>
      </div>
      <div className="dashboard-panel">
        <h2>My campaigns</h2>
        {loading ? <div className="loading-state">Loading campaigns…</div> : items.length === 0 ? <p className="muted">No campaigns yet.</p> :
          <div className="ngo-campaign-list">{items.map((campaign) => {
            const latestRequest = campaign.deletionRequests?.[campaign.deletionRequests.length - 1];
            const canEdit = ['DRAFT', 'REJECTED', 'RESUBMISSION_REQUIRED'].includes(campaign.status);
            const requestPending = latestRequest?.status === 'PENDING';
            return <article className="ngo-campaign-card" key={campaign._id}>
              <div className="ngo-campaign-cover">
                <CampaignImage campaign={campaign} kind="cover" value={campaign.coverImage} alt={`${campaign.title} cover`}/>
              </div>
              <div className="ngo-campaign-content">
                <div className="ngo-campaign-title-row"><div><h3>{campaign.title}</h3><p>{campaign.category} · {campaign.type || 'MONEY'} · {campaign.location}</p></div><span className="status-badge">{campaign.status}</span></div>
                <div className="ngo-campaign-status-row"><span>Review: {campaign.reviewStatus || campaign.status}</span><span>Publication: {campaign.publicationStatus || (campaign.status === 'PUBLISHED' ? 'PUBLISHED' : 'UNPUBLISHED')}</span></div>
                {campaign.reviewNote && <p className="notice">{campaign.reviewNote}</p>}
                <div className="ngo-campaign-metrics">
                  <span><small>Goal</small><b>NPR {Number(campaign.targetAmount || 0).toLocaleString('en-NP')}</b></span>
                  <span><small>Confirmed raised</small><b>NPR {Number(campaign.raisedAmount || 0).toLocaleString('en-NP')}</b></span>
                  <span><small>Remaining</small><b>NPR {Number(campaign.remainingAmount || 0).toLocaleString('en-NP')}</b></span>
                  <span><small>Progress</small><b>{Number(campaign.progressPercent || 0).toFixed(1)}%</b></span>
                  <span><small>Donors</small><b>{campaign.donorCount || 0}</b></span>
                  <span><small>Volunteer spots</small><b>{campaign.volunteerSlotsFilled || 0} / {campaign.requiredVolunteers || 0}</b></span>
                </div>
                <small className="ngo-campaign-dates">{campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : 'No start date'} – {campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : 'No end date'}</small>
                {latestRequest && <div className={`notice deletion-request-status ${latestRequest.status === 'REJECTED' ? 'error' : ''}`}>
                  Deletion request: <b>{latestRequest.status}</b>{latestRequest.reviewNote ? ` — ${latestRequest.reviewNote}` : ''}
                </div>}
                <div className="ngo-campaign-actions">
                  <Link className="btn btn-small" to={`/ngo/campaigns/${campaign._id}`}>View campaign dashboard</Link>
                  {canEdit && ngo?.verificationStatus === 'VERIFIED' && <button className="btn btn-ghost btn-small" type="button" onClick={() => edit(campaign)}>Edit</button>}
                  {canEdit && ngo?.verificationStatus === 'VERIFIED' && <button className="btn btn-ghost btn-small" type="button" onClick={() => submit(campaign._id)}>Submit for review</button>}
                  {campaign.status !== 'ARCHIVED' && !requestPending && <button className="btn btn-danger btn-small" type="button" onClick={() => { setDeletionTarget(campaign); setDeletionReason(''); }}>Request deletion</button>}
                  <Link className="text-link" to={`/ngo/campaigns/${campaign._id}#donations`}>Donations</Link>
                  <Link className="text-link" to={`/ngo/campaigns/${campaign._id}#volunteers`}>Volunteers</Link>
                  <Link className="text-link" to="/ngo/reports">Financial report</Link>
                  <Link className="text-link" to={`/ngo/campaigns/${campaign._id}#updates`}>Campaign updates</Link>
                </div>
              </div>
            </article>;
          })}</div>}
      </div>
    </div>
    {deletionTarget && <div className="modal-backdrop" role="presentation">
      <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="deletion-dialog-title">
        <h2 id="deletion-dialog-title">Request campaign deletion</h2>
        <p>This submits a request to an administrator. The campaign and its records will remain intact until reviewed.</p>
        <form className="auth-form" onSubmit={requestDeletion}>
          <label>Reason for deletion<textarea required minLength={5} maxLength={1000} rows={4} value={deletionReason} onChange={(e) => setDeletionReason(e.target.value)}/></label>
          <div className="campaign-form-actions">
            <button className="btn btn-danger" type="submit" disabled={deletionSaving}>{deletionSaving ? 'Submitting…' : 'Confirm deletion request'}</button>
            <button className="btn btn-ghost" type="button" disabled={deletionSaving} onClick={() => setDeletionTarget(null)}>Cancel</button>
          </div>
        </form>
      </section>
    </div>}
  </div></main>;
}

function Overview(){
 const {user}=useAuth();
 const [data,setData]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{api.get(user?.role==='ADMIN'?'/campaigns/admin/overview':user?.role==='NGO'?'/ngos/me/summary':'/campaigns/citizens/me/summary').then(r=>setData(r.data.data)).catch(e=>setError(e.response?.data?.message||'Dashboard summary is not available yet.'));},[user,refresh]);
 const admin=user?.role==='ADMIN',ngo=user?.role==='NGO';
 const canReviewDeletion=user?.adminLevel==='MAIN_ADMIN'||user?.permissions?.includes('campaign.deletion.review');
 return <main className="dashboard-page"><div className="container"><div className="dashboard-head"><div><span className="section-kicker">{admin?'GOVERNMENT CONSOLE':ngo?'ORGANIZATION WORKSPACE':'YOUR NEPALCARE'}</span><h1>Hello, {user?.name?.split(' ')[0]||'there'} <span>✳</span></h1><p>{admin?'Review organizations, campaigns, and platform activity.':ngo?'Manage your organization and submit relief campaigns.':'Your kindness has a place here. Track your activity and find ways to help.'}</p></div><button className="btn btn-outline" onClick={()=>setRefresh(x=>x+1)}><RefreshCw size={16}/> Refresh</button></div>
 <div className="dashboard-grid"><div className="dashboard-main"><div className="dashboard-panel"><div className="panel-heading"><div><h2>{admin?'Platform overview':ngo?'Organization overview':'Your activity'}</h2><p>Live data from your NepalCare account</p></div><span className="status-badge">{user?.role}</span></div>{error&&<div className="notice">{error}</div>}<div className="stat-grid">{(admin?[['NGOs to review',data?.pendingNgos??'—',ShieldCheck],['Campaigns pending',data?.pendingCampaigns??'—',ClipboardCheck],['Registered users',data?.users??'—',Users],['Donation records',data?.donations??'—',HeartHandshake]]:ngo?[['Verification status',data?.verificationStatus||'PENDING',ShieldCheck],['Your campaigns',data?.campaigns??'—',Activity],['Volunteer applications',data?.volunteers??'—',Users],['Item donation requests',data?.itemRequests??'—',Package]]:[['Donations made',data?.donations??'—',HeartHandshake],['Volunteer applications',data?.volunteerApplications??'—',Users],['Account status',user?.isActive?'Active':'Review',ShieldCheck],['Community','NepalCare',Activity]]).map(([label,value,Icon])=><div className="stat-card" key={label}><span className="stat-icon"><Icon size={19}/></span><small>{label}</small><strong>{value}</strong></div>)}</div></div>
 <div className="dashboard-panel"><div className="panel-heading"><div><h2>Next steps</h2><p>Pick up where you can make a difference.</p></div></div><div className="action-list">{(admin?[['Review NGO registrations','Verify organization documents and status','/admin/ngos'],['Review campaigns','Approve or request changes to campaigns','/admin/campaigns'],['Verify donations','Review submitted bank and QR transfers','/admin/donations'],['Verify campaign expenses','Review submitted campaign receipts','/admin/expenses'],...(canReviewDeletion?[['Campaign deletion requests','Review NGO archive requests','/admin/campaign-deletions']]:[])]:ngo?[['Complete organization profile','Submit organization information for verification','/ngo/profile'],['Create a relief campaign','Draft and submit a campaign for review','/ngo/campaigns'],['Volunteer applications','Review applications and send volunteer offers','/ngo/volunteers'],['Item donation requests','Manage pickups and confirm collected items','/ngo/item-donations'],['Donations','View campaign donation records','/ngo/donations'],['Financial reports','Review confirmed campaign totals','/ngo/reports']]:[['Explore relief campaigns','Find verified campaigns to support','/campaigns'],['Apply to volunteer','Use your Citizen account to help on the ground','/campaigns']]).map(([title,desc,to])=><Link className="action-row" to={to} key={title}><span className="action-icon"><Plus size={18}/></span><span><b>{title}</b><small>{desc}</small></span><span className="action-arrow">↗</span></Link>)}</div></div></div>
 <aside className="dashboard-side"><div className="welcome-card"><div className="welcome-icon"><HeartHandshake size={27}/></div><span className="section-kicker light-kicker">YOUR IMPACT STARTS HERE</span><h3>Care is a community effort.</h3><p>Every verified organization, transparent update, and volunteer hour helps build trust.</p><Link to="/campaigns" className="btn btn-light">Explore campaigns ↗</Link></div></aside></div></div></main>;
}

export default function Dashboard(){
 const location=useLocation();
 const {user}=useAuth();
 if(location.pathname.startsWith('/admin/ngos'))return <AdminNGOs/>;
 if(location.pathname.startsWith('/admin/campaigns'))return <AdminCampaigns/>;
 if(location.pathname.startsWith('/admin/campaign-deletions'))return <CampaignDeletionReviews/>;
 if(location.pathname.startsWith('/admin/expenses'))return <AdminExpenses/>;
 if(location.pathname.startsWith('/admin/donations')||location.pathname.startsWith('/ngo/donations/review'))return <TransferReviews/>;
 if(location.pathname.startsWith('/ngo/donations'))return <NGODonations/>;
 if(location.pathname.startsWith('/ngo/profile'))return <NGOProfile/>;
 if(/^\/ngo\/campaigns\/[^/]+$/.test(location.pathname))return <NGOCampaignManagement/>;
 if(location.pathname.startsWith('/ngo/campaigns'))return <NGOCampaigns/>;
 if(location.pathname.startsWith('/ngo/item-donations'))return <NGOItemDonations/>;
 if(location.pathname.startsWith('/ngo/volunteers'))return <NGOVolunteerManagement/>;
 if(location.pathname.startsWith('/ngo/reports'))return <NGOReports/>;
 return user?.role==='CITIZEN'?<DonorDashboard/>:<Overview />;
}
