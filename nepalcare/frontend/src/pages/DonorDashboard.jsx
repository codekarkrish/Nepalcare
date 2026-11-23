import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { HeartHandshake, Package, Users, RefreshCw, Download, CheckCircle } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

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
  return src ? <img src={src} alt={alt}/> : <div className="campaign-image-fallback">Image unavailable</div>;
}

function campaignCover(campaign) {
  if (!campaign?.coverImage) return '';
  if (/^https?:\/\//i.test(campaign.coverImage)) return campaign.coverImage;
  return `${api.defaults.baseURL.replace(/\/$/, '')}/campaigns/${campaign._id}/images/cover`;
}

export default function DonorDashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const [summary, setSummary] = useState(null);
  const [donations, setDonations] = useState([]);
  const [applications, setApplications] = useState([]);
  const [itemRequests, setItemRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [declineReasons, setDeclineReasons] = useState({});
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrors([]);
    Promise.allSettled([
      api.get('/campaigns/citizens/me/summary'),
      api.get('/donations/mine'),
      api.get('/volunteers/mine'),
      api.get('/item-donations/mine')
    ]).then((results) => {
      if (!active) return;
      const failures = [];
      if (results[0].status === 'fulfilled') setSummary(results[0].value.data.data);
      else failures.push(results[0].reason.response?.data?.message || 'Impact summary could not be loaded.');
      if (results[1].status === 'fulfilled') setDonations(results[1].value.data.data.items);
      else failures.push(results[1].reason.response?.data?.message || 'Donation history could not be loaded.');
      if (results[2].status === 'fulfilled') setApplications(results[2].value.data.data.items);
      else failures.push(results[2].reason.response?.data?.message || 'Volunteering history could not be loaded.');
      if (results[3].status === 'fulfilled') setItemRequests(results[3].value.data.data.items);
      else failures.push(results[3].reason.response?.data?.message || 'Item donation history could not be loaded.');
      setErrors(failures);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    const sectionId = decodeURIComponent(location.hash.slice(1));
    if (!sectionId) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [location.hash]);

  const respond = async (application, status) => {
    if (status === 'WITHDRAWN' && !window.confirm('Decline or withdraw this volunteer application?')) return;
    setBusyId(application._id);
    setMessage('');
    setErrors([]);
    try {
      await api.patch(`/volunteers/${application._id}/response`, {
        status,
        reason: declineReasons[application._id] || ''
      });
      setMessage(status === 'ACCEPTED' ? 'Volunteer offer accepted.' : 'Volunteer application withdrawn.');
      setRefresh((value) => value + 1);
    } catch (e) {
      setErrors([e.response?.data?.message || 'Could not update volunteer application.']);
    } finally {
      setBusyId('');
    }
  };

  const uploadCertificate = async (event, application) => {
    event.preventDefault();
    const file = event.currentTarget.elements.certificate.files[0];
    if (!file) return setErrors(['Choose a certificate PDF, JPG or PNG file.']);
    const formData = new FormData();
    formData.append('certificate', file);
    setBusyId(application._id);
    setMessage('');
    setErrors([]);
    try {
      await api.post(`/volunteers/${application._id}/certificate`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMessage('Volunteer certificate uploaded securely.');
      setRefresh((value) => value + 1);
    } catch (e) {
      setErrors([e.response?.data?.message || 'Could not upload certificate.']);
    } finally {
      setBusyId('');
    }
  };

  const downloadCertificate = async (application) => {
    setBusyId(application._id);
    setErrors([]);
    try {
      const { data } = await api.get(`/volunteers/${application._id}/certificate`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = application.certificate?.originalName || 'volunteer-certificate';
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrors([e.response?.data?.message || 'Could not download certificate.']);
    } finally {
      setBusyId('');
    }
  };

  const cancelItemRequest = async (request) => {
    if (!window.confirm(`Cancel item request ${request.reference}?`)) return;
    setBusyId(request._id);
    setErrors([]);
    try {
      await api.patch(`/item-donations/${request._id}/cancel`);
      setMessage(`Item request ${request.reference} cancelled.`);
      setRefresh((value) => value + 1);
    } catch (e) {
      setErrors([e.response?.data?.message || 'Could not cancel this item request.']);
    } finally {
      setBusyId('');
    }
  };

  const formatNPR = (value) => `NPR ${Number(value || 0).toLocaleString('en-NP', { maximumFractionDigits: 2 })}`;

  return <main className="dashboard-page"><div className="container donor-dashboard">
    <div className="dashboard-head">
      <div><span className="section-kicker">CITIZEN DASHBOARD</span><h1>Your impact, {user?.name?.split(' ')[0] || 'donor'}</h1><p>Track confirmed giving, volunteer offers and item collections.</p></div>
      <button className="btn btn-outline" onClick={() => setRefresh((value) => value + 1)} disabled={loading}><RefreshCw size={16}/> Refresh</button>
    </div>
    {errors.map((error) => <div className="notice error" key={error}>{error}</div>)}
    {message && <div className="notice">{message}</div>}
    <div className="stat-grid donor-impact-cards">
      <div className="stat-card"><span className="stat-icon"><HeartHandshake size={19}/></span><small>Total confirmed donations</small><strong>{loading ? '…' : formatNPR(summary?.totalDonationAmount)}</strong></div>
      <div className="stat-card"><span className="stat-icon"><CheckCircle size={19}/></span><small>Campaigns supported</small><strong>{loading ? '…' : summary?.campaignsSupported ?? 0}</strong></div>
      <div className="stat-card"><span className="stat-icon"><Users size={19}/></span><small>Volunteer applications</small><strong>{loading ? '…' : summary?.volunteerApplications ?? 0}</strong></div>
      <div className="stat-card"><span className="stat-icon"><Users size={19}/></span><small>Active volunteer roles</small><strong>{loading ? '…' : summary?.activeVolunteerRoles ?? 0}</strong></div>
    </div>
    <section className="dashboard-panel management-section" id="my-donations">
      <div className="panel-heading"><div><h2>My Donations</h2><p>Only successful, verified donations are included in the impact total.</p></div></div>
      {loading ? <div className="loading-state">Loading donation history…</div> : donations.length
        ? <div className="management-record-list">{donations.map((donation) => <article className="management-record donor-history-card" key={donation._id}>
          <div className="donor-history-campaign">
            {campaignCover(donation.campaign) && <img src={campaignCover(donation.campaign)} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }}/>}
            <div><b>{donation.campaign?.title || 'Campaign unavailable'}</b><small>{donation.campaign?.ngo?.organizationName || 'NepalCare campaign'}</small></div>
          </div>
          <div><b>{formatNPR(donation.amount)}</b><span className="status-badge">{donation.status}</span><small>{new Date(donation.createdAt).toLocaleDateString()}</small>
            <small>Reference: {donation.providerReference || donation.transferReference || donation.transactionUuid || 'Not available'}</small></div>
        </article>)}</div>
        : <div className="empty-campaigns"><h3>No donations yet</h3><p>Your confirmed donations will be listed here.</p></div>}
    </section>

    <section className="dashboard-panel management-section" id="my-volunteering">
      <div className="panel-heading"><div><h2>My Volunteering</h2><p>Offers become active roles only after you accept them.</p></div></div>
      {loading ? <div className="loading-state">Loading volunteering history…</div> : applications.length
        ? <div className="management-record-list">{applications.map((application) => <article className="management-record donor-history-card" key={application._id}>
          <div className="donor-history-campaign">
            {campaignCover(application.campaign) && <img src={campaignCover(application.campaign)} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }}/>}
            <div><b>{application.campaign?.title || 'Campaign unavailable'}</b><small>{application.campaign?.ngo?.organizationName || 'NGO'} · {application.campaign?.location || ''}</small></div>
          </div>
          <div className="donor-role-detail">
            <span className="status-badge">{application.status}</span>
            {application.offer && <>
              <b>{application.offer.role}</b><small>{application.offer.roleDescription}</small>
              <p><b>Responsibilities:</b> {application.offer.responsibilities}</p>
              <p><b>Policies:</b> {application.offer.policies}</p>
              <small>Hours: {application.offer.expectedHours} · Starts {new Date(application.offer.startDate).toLocaleDateString()} · Duration {application.offer.duration}</small>
              {application.offer.benefits && <small>Benefits: {application.offer.benefits}</small>}
              <small>NGO contact: {application.offer.contactPerson} · {application.offer.contactEmail} · {application.offer.contactPhone}</small>
              {application.offer.instructions && <small>Instructions: {application.offer.instructions}</small>}
            </>}
            {application.status === 'OFFER_SENT' && <div className="review-actions">
              <button className="btn" type="button" disabled={busyId === application._id} onClick={() => respond(application, 'ACCEPTED')}>Accept offer</button>
              <input aria-label="Optional decline reason" placeholder="Optional decline reason" value={declineReasons[application._id] || ''} onChange={(e) => setDeclineReasons({ ...declineReasons, [application._id]: e.target.value })}/>
              <button className="btn btn-danger" type="button" disabled={busyId === application._id} onClick={() => respond(application, 'WITHDRAWN')}>Decline offer</button>
            </div>}
            {['PENDING', 'UNDER_REVIEW', 'ACCEPTED'].includes(application.status) && <button className="btn btn-ghost btn-small" type="button" disabled={busyId === application._id} onClick={() => respond(application, 'WITHDRAWN')}>Withdraw application</button>}
            {application.status === 'COMPLETED' && <div className="certificate-panel">
              <small>Certificate status: {application.certificate ? `uploaded ${new Date(application.certificate.uploadedAt).toLocaleDateString()}` : 'not uploaded'}</small>
              {application.certificate && <button className="btn btn-ghost btn-small" type="button" disabled={busyId === application._id} onClick={() => downloadCertificate(application)}><Download size={15}/> Download certificate</button>}
              <form className="auth-form" onSubmit={(event) => uploadCertificate(event, application)}>
                <label>Upload certificate (PDF/JPG/PNG, up to 5 MB)<input name="certificate" required type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"/></label>
                <button className="btn btn-small" type="submit" disabled={busyId === application._id}>{busyId === application._id ? 'Uploading…' : 'Upload certificate'}</button>
              </form>
            </div>}
          </div>
        </article>)}</div>
        : <div className="empty-campaigns"><h3>No volunteer applications</h3><p>Apply to a campaign to see updates and offers here.</p></div>}
    </section>

    <section className="dashboard-panel management-section" id="my-item-donations">
      <div className="panel-heading"><div><h2>My Item Donations</h2><p>Requests remain pending until the NGO confirms collection.</p></div></div>
      {loading ? <div className="loading-state">Loading item donation history…</div> : itemRequests.length
        ? <div className="management-record-list">{itemRequests.map((request) => <article className="management-record donor-history-card" key={request._id}>
          <div><b>{request.campaign?.title || 'Campaign unavailable'} · {request.reference}</b><small>{request.pickupLocation}</small>
            <ul>{request.items.map((item, index) => <li key={`${item.name}-${index}`}>{item.name} · {item.quantity} · {item.condition}</li>)}</ul>
            {request.photos.map((photo) => <PrivateImage key={photo._id} url={`/item-donations/${request._id}/photos/${photo._id}`} alt={`Item donation ${photo.originalName}`}/>)}
          </div>
          <div><span className="status-badge">{request.status.replaceAll('_', ' ')}</span><small>Preferred: {new Date(request.preferredPickupDate).toLocaleDateString()} · {request.preferredPickupTime}</small>
            {request.scheduledPickupAt && <small>Scheduled: {new Date(request.scheduledPickupAt).toLocaleString()}</small>}
            {request.collectedAt && <small>Collected: {new Date(request.collectedAt).toLocaleString()}</small>}
            {['PENDING', 'ACCEPTED', 'CONTACTED', 'PICKUP_SCHEDULED'].includes(request.status) && <button className="btn btn-ghost btn-small" type="button" disabled={busyId === request._id} onClick={() => cancelItemRequest(request)}>Cancel request</button>}
          </div>
        </article>)}</div>
        : <div className="empty-campaigns"><h3>No item donation requests</h3><p>Your physical item requests and collection status will appear here.</p></div>}
    </section>
  </div></main>;
}
