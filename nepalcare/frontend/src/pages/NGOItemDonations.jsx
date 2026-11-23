import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import api from '../services/api';

function PrivateImage({ url, alt }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    api.get(url, { responseType: 'blob' })
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
  }, [url]);
  return src ? <img src={src} alt={alt}/> : <div className="campaign-image-fallback">Item photo unavailable</div>;
}

export default function NGOItemDonations() {
  const [campaigns, setCampaigns] = useState([]);
  const [items, setItems] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [campaignId, setCampaignId] = useState('');
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState({});
  const [schedule, setSchedule] = useState({});
  const [assignees, setAssignees] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (campaignId) params.set('campaignId', campaignId);
      if (status) params.set('status', status);
      const [requests, campaignResponse, volunteerResponse] = await Promise.all([
        api.get(`/item-donations/ngo${params.size ? `?${params}` : ''}`),
        api.get('/campaigns/ngo/mine'),
        api.get(`/volunteers/ngo?status=ACCEPTED${campaignId ? `&campaignId=${campaignId}` : ''}`)
      ]);
      setItems(requests.data.data.items);
      setCampaigns(campaignResponse.data.data.items);
      setVolunteers(volunteerResponse.data.data.items);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load item donation requests.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [campaignId, status]);

  const update = async (item, nextStatus) => {
    if (nextStatus === 'COLLECTED' && !window.confirm(`Confirm collection for ${item.reference}?`)) return;
    if (nextStatus === 'REJECTED' && !String(notes[item._id] || '').trim()) {
      setError('Provide a reason before rejecting an item request.');
      return;
    }
    if (nextStatus === 'PICKUP_SCHEDULED' && !schedule[item._id]) {
      setError('Choose a pickup date and time.');
      return;
    }
    setBusyId(item._id);
    setError('');
    setSuccess('');
    try {
      await api.patch(`/item-donations/${item._id}/status`, {
        status: nextStatus,
        note: notes[item._id] || '',
        scheduledPickupAt: schedule[item._id],
        volunteerApplicationId: assignees[item._id] || ''
      });
      setSuccess(`${item.reference} updated to ${nextStatus.replaceAll('_', ' ').toLowerCase()}.`);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Could not update this request.');
    } finally {
      setBusyId('');
    }
  };

  return <main className="dashboard-page"><div className="container">
    <div className="dashboard-head"><div><span className="section-kicker">NGO WORKSPACE</span><h1>Item Donation Requests</h1><p>Coordinate pickup and mark items collected only after receipt.</p></div>
      <button className="btn btn-outline" onClick={load} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
    {error && <div className="notice error">{error}</div>}
    {success && <div className="notice">{success}</div>}
    <div className="volunteer-filter-bar">
      <label>Campaign<select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">All campaigns</option>{campaigns.map((campaign) => <option value={campaign._id} key={campaign._id}>{campaign.title}</option>)}</select></label>
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{['PENDING', 'ACCEPTED', 'CONTACTED', 'PICKUP_SCHEDULED', 'COLLECTED', 'REJECTED', 'CANCELLED'].map((value) => <option key={value}>{value}</option>)}</select></label>
    </div>
    {loading ? <div className="loading-state">Loading item donation requests…</div> : !items.length
      ? <div className="empty-campaigns"><h3>No matching item requests</h3><p>Physical donation requests for your campaigns will appear here.</p></div>
      : <div className="item-request-list">{items.map((item) => <article className="dashboard-panel item-request-card" key={item._id}>
        <div className="panel-heading"><div><h2>{item.reference} · {item.campaign?.title || 'Campaign'}</h2><p>{new Date(item.createdAt).toLocaleString()}</p></div><span className="status-badge">{item.status.replaceAll('_', ' ')}</span></div>
        <div className="item-request-details">
          <div><h3>Donor and pickup</h3><p><b>{item.donorName || item.donor?.name}</b></p><p>{item.donorEmail || item.donor?.email} · {item.donorPhone || item.donor?.phone}</p>
            <p>Address: {item.address}</p><p>Pickup: {item.pickupLocation}</p>
            {item.mapUrl && <a className="text-link" href={item.mapUrl} target="_blank" rel="noreferrer">Open Google Maps link</a>}
            {item.coordinates && <small>Coordinates: {item.coordinates.latitude}, {item.coordinates.longitude}</small>}
            <p>Preferred: {new Date(item.preferredPickupDate).toLocaleDateString()} · {item.preferredPickupTime}</p>
          </div>
          <div><h3>Items</h3><ul>{item.items.map((entry, index) => <li key={`${entry.name}-${index}`}><b>{entry.name}</b> · {entry.category} · {entry.quantity} · {entry.condition}{entry.description && <small>{entry.description}</small>}</li>)}</ul>
            {item.photos?.length > 0 && <div className="item-request-photos">{item.photos.map((photo) => <PrivateImage key={photo._id} url={`/item-donations/${item._id}/photos/${photo._id}`} alt={photo.originalName}/>)}</div>}
          </div>
        </div>
        {item.status === 'PICKUP_SCHEDULED' && <p className="notice">Scheduled pickup: {item.scheduledPickupAt ? new Date(item.scheduledPickupAt).toLocaleString() : 'Not set'}{item.assignedVolunteer ? ` · Volunteer: ${item.assignedVolunteer.fullName || item.assignedVolunteer.citizen?.name || 'Assigned'}` : ''}</p>}
        {!['COLLECTED', 'REJECTED', 'CANCELLED'].includes(item.status) && <div className="item-request-actions">
          {item.status === 'PENDING' && <>
            <button className="btn" type="button" disabled={busyId === item._id} onClick={() => update(item, 'ACCEPTED')}>Accept request</button>
            <input maxLength="1000" placeholder="Rejection reason" value={notes[item._id] || ''} onChange={(event) => setNotes({ ...notes, [item._id]: event.target.value })}/>
            <button className="btn btn-danger" type="button" disabled={busyId === item._id} onClick={() => update(item, 'REJECTED')}>Reject</button>
          </>}
          {item.status === 'ACCEPTED' && <button className="btn btn-ghost" type="button" disabled={busyId === item._id} onClick={() => update(item, 'CONTACTED')}>Mark donor contacted</button>}
          {['ACCEPTED', 'CONTACTED'].includes(item.status) && <>
            <label>Pickup date and time<input type="datetime-local" value={schedule[item._id] || ''} onChange={(event) => setSchedule({ ...schedule, [item._id]: event.target.value })}/></label>
            <label>Assign accepted volunteer<select value={assignees[item._id] || ''} onChange={(event) => setAssignees({ ...assignees, [item._id]: event.target.value })}>
              <option value="">No volunteer assigned</option>{volunteers.filter((volunteer) => String(volunteer.campaign?._id) === String(item.campaign?._id)).map((volunteer) => <option key={volunteer._id} value={volunteer._id}>{volunteer.fullName || volunteer.citizen?.name} · {volunteer.offer?.role || 'Volunteer'}</option>)}
            </select></label>
            <button className="btn btn-ghost" type="button" disabled={busyId === item._id} onClick={() => update(item, 'PICKUP_SCHEDULED')}>Schedule pickup</button>
          </>}
          {item.status === 'PICKUP_SCHEDULED' && <button className="btn" type="button" disabled={busyId === item._id} onClick={() => update(item, 'COLLECTED')}>Confirm collected</button>}
          {item.status === 'PICKUP_SCHEDULED' && <button className="btn btn-ghost" type="button" disabled={busyId === item._id} onClick={() => update(item, 'CONTACTED')}>Reschedule</button>}
        </div>}
      </article>)}</div>}
  </div></main>;
}
