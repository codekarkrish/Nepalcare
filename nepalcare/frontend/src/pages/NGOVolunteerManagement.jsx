import { useEffect, useState } from 'react';
import { CheckCircle, RefreshCw, XCircle } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const initialOffer = (user) => ({
  role: '',
  roleDescription: '',
  responsibilities: '',
  policies: '',
  expectedHours: '',
  startDate: new Date().toISOString().slice(0, 10),
  duration: '',
  benefits: '',
  contactPerson: user?.name || '',
  contactEmail: user?.email || '',
  contactPhone: user?.phone || '',
  instructions: ''
});

export default function NGOVolunteerManagement() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [items, setItems] = useState([]);
  const [campaignId, setCampaignId] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const [offer, setOffer] = useState(() => initialOffer(user));
  const [message, setMessage] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [infoRequest, setInfoRequest] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (campaignId) params.set('campaignId', campaignId);
      if (status) params.set('status', status);
      const [applications, campaignResponse] = await Promise.all([
        api.get(`/volunteers/ngo${params.size ? `?${params}` : ''}`),
        api.get('/campaigns/ngo/mine')
      ]);
      setItems(applications.data.data.items);
      setCampaigns(campaignResponse.data.data.items);
      if (selected) {
        setSelected(applications.data.data.items.find((item) => item._id === selected._id) || null);
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load volunteer applications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [campaignId, status]);
  useEffect(() => { setOffer(initialOffer(user)); }, [user]);

  const review = async (action, data = {}) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api.patch(`/volunteers/${selected._id}/review`, { action, ...data });
      setSuccess(action === 'OFFER_SENT' ? 'Official volunteer offer sent to the applicant.' :
        action === 'REJECTED' ? 'Volunteer application rejected.' : 'Information request sent to the applicant.');
      setRejectionReason('');
      setInfoRequest('');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Could not update this volunteer application.');
    } finally {
      setBusy(false);
    }
  };

  const field = (name, label, { required = true, type = 'text', rows } = {}) => (
    <label key={name}>{label}{rows
      ? <textarea required={required} rows={rows} maxLength={name === 'responsibilities' || name === 'policies' ? 3000 : 2000} value={offer[name]} onChange={(event) => setOffer({ ...offer, [name]: event.target.value })}/>
      : <input required={required} type={type} maxLength={name === 'contactEmail' ? 254 : undefined} value={offer[name]} onChange={(event) => setOffer({ ...offer, [name]: event.target.value })}/>}
    </label>
  );

  return <main className="dashboard-page"><div className="container">
    <div className="dashboard-head"><div><span className="section-kicker">NGO WORKSPACE</span><h1>Volunteer Applications</h1><p>Review applications, request information and send official volunteer offers.</p></div>
      <button className="btn btn-outline" onClick={load} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
    {error && <div className="notice error">{error}</div>}
    {success && <div className="notice">{success}</div>}
    <div className="volunteer-filter-bar">
      <label>Campaign<select value={campaignId} onChange={(event) => { setCampaignId(event.target.value); setSelected(null); }}>
        <option value="">All campaigns</option>{campaigns.map((campaign) => <option value={campaign._id} key={campaign._id}>{campaign.title}</option>)}
      </select></label>
      <label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); setSelected(null); }}>
        <option value="">All statuses</option>{['PENDING', 'UNDER_REVIEW', 'OFFER_SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'COMPLETED'].map((value) => <option key={value}>{value}</option>)}
      </select></label>
    </div>
    {loading ? <div className="loading-state">Loading volunteer applications…</div> : !items.length
      ? <div className="empty-campaigns"><h3>No matching volunteer applications</h3><p>New applications will appear here.</p></div>
      : <div className="review-layout volunteer-review-layout">
        <div className="review-list">{items.map((item) => <button type="button" className={`review-card ${selected?._id === item._id ? 'active' : ''}`} key={item._id} onClick={() => { setSelected(item); setOffer(initialOffer(user)); }}>
          <b>{item.fullName || item.citizen?.name || 'Applicant'}</b><small>{item.campaign?.title || 'Campaign'}</small><span className="status-badge">{item.status}</span>
        </button>)}</div>
        <section className="dashboard-panel review-detail volunteer-detail">
          {!selected ? <div className="empty-detail">Select an application to review.</div> : <>
            <div className="panel-heading"><div><h2>{selected.fullName || selected.citizen?.name || 'Applicant'}</h2><p>{selected.campaign?.title} · {selected.campaign?.location}</p></div><span className="status-badge">{selected.status}</span></div>
            <dl className="detail-grid">
              <dt>Email</dt><dd>{selected.email || selected.citizen?.email || '—'}</dd>
              <dt>Phone</dt><dd>{selected.phone || selected.citizen?.phone || '—'}</dd>
              <dt>Current location</dt><dd>{selected.currentLocation || '—'}</dd>
              <dt>Motivation</dt><dd>{selected.message || '—'}</dd>
              <dt>Additional message</dt><dd>{selected.additionalMessage || '—'}</dd>
              <dt>Skills / experience</dt><dd>{selected.skills || 'Not provided'}</dd>
              <dt>Preferred dates</dt><dd>{selected.preferredDates?.length ? selected.preferredDates.map((date) => new Date(date).toLocaleDateString()).join(', ') : 'Not specified'}</dd>
              <dt>Available days / time</dt><dd>{selected.availability || '—'}</dd>
              <dt>Time commitment</dt><dd>{selected.commitmentHours || '—'}</dd>
              <dt>Received</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd>
              {selected.rejectionReason && <><dt>Rejection reason</dt><dd>{selected.rejectionReason}</dd></>}
            </dl>
            {['PENDING', 'UNDER_REVIEW'].includes(selected.status) && <div className="volunteer-actions">
              <form className="auth-form" onSubmit={(event) => { event.preventDefault(); review('UNDER_REVIEW', { message: infoRequest }); }}>
                <label>Request more information<textarea required rows={2} maxLength={2000} value={infoRequest} onChange={(event) => setInfoRequest(event.target.value)}/></label>
                <button className="btn btn-ghost btn-small" type="submit" disabled={busy}>Send information request</button>
              </form>
              <form className="auth-form" onSubmit={(event) => { event.preventDefault(); review('REJECTED', { reason: rejectionReason }); }}>
                <label>Rejection reason<textarea required rows={2} maxLength={1000} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)}/></label>
                <button className="btn btn-danger btn-small" type="submit" disabled={busy}><XCircle size={15}/> Reject application</button>
              </form>
              <form className="auth-form offer-form" onSubmit={(event) => { event.preventDefault(); review('OFFER_SENT', { offer }); }}>
                <h3>Official volunteer offer</h3>
                {field('role', 'Assigned role')}
                {field('roleDescription', 'Role description', { rows: 2 })}
                {field('responsibilities', 'Responsibilities and tasks', { rows: 3 })}
                {field('policies', 'Volunteer policies and rules', { rows: 3 })}
                {field('expectedHours', 'Expected working hours')}
                {field('startDate', 'Start date', { type: 'date' })}
                {field('duration', 'Expected duration')}
                {field('benefits', 'Benefits or perks', { required: false, rows: 2 })}
                {field('contactPerson', 'Contact person')}
                {field('contactEmail', 'Contact email', { type: 'email' })}
                {field('contactPhone', 'Contact phone')}
                {field('instructions', 'Special instructions', { required: false, rows: 2 })}
                <button className="btn btn-small" type="submit" disabled={busy}><CheckCircle size={15}/> Send official offer</button>
              </form>
            </div>}
            {selected.status === 'ACCEPTED' && <button className="btn btn-outline" type="button" disabled={busy} onClick={() => review('COMPLETED')}>Mark volunteering completed</button>}
            <div className="application-history">
              <h3>Communication history</h3>
              {[...(selected.statusHistory || []).map((entry) => ({ ...entry, kind: 'status' })), ...(selected.communicationHistory || []).map((entry) => ({ ...entry, kind: 'message' }))]
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                .map((entry, index) => <p key={`${entry.kind}-${index}`}><b>{entry.kind === 'status' ? entry.status.replaceAll('_', ' ') : 'Message'}:</b> {entry.note || entry.message || 'Status updated'} · {new Date(entry.createdAt).toLocaleString()}</p>)}
            </div>
          </>}
        </section>
      </div>}
  </div></main>;
}
