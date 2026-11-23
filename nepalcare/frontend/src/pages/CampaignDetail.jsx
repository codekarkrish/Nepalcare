import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Users, HeartHandshake, CalendarDays, Package, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './CampaignWorkflows.css';

const categoryLabels = {
  FOOD: 'Food',
  CLOTHES: 'Clothes',
  BLANKETS: 'Blankets',
  EDUCATION: 'Education',
  BOOKS: 'Books',
  STATIONERY: 'Stationery',
  UTENSILS: 'Utensils',
  MEDICAL: 'Medical',
  DISASTER_RELIEF: 'Disaster relief',
  FUNDRAISING: 'Fundraising',
  OTHER: 'Other'
};

const conditionLabels = {
  NEW: 'New',
  LIKE_NEW: 'Like new',
  GOOD: 'Good',
  ANY: 'Any acceptable condition'
};

function imageSource(campaign, kind, value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const apiBase = api.defaults.baseURL.replace(/\/$/, '');
  return `${apiBase}/campaigns/${campaign._id}/images/${kind}`;
}

export default function CampaignDetail() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [paymentOptions, setPaymentOptions] = useState(null);
  const [paymentOptionsLoading, setPaymentOptionsLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [proof, setProof] = useState(null);
  const [transferIntentId, setTransferIntentId] = useState('');
  const [intentKey, setIntentKey] = useState('');
  const [volunteerOpen, setVolunteerOpen] = useState(false);
  const [volunteerError, setVolunteerError] = useState('');
  const [volunteerMessage, setVolunteerMessage] = useState('');
  const [volunteerApplied, setVolunteerApplied] = useState(false);
  const [volunteerForm, setVolunteerForm] = useState({
    phone: '', skills: '', preferredDates: [''], availability: '', commitmentHours: '', currentLocation: '', message: '', additionalMessage: ''
  });
  const [itemDonationOpen, setItemDonationOpen] = useState(false);
  const [itemDonationError, setItemDonationError] = useState('');
  const [itemDonationMessage, setItemDonationMessage] = useState('');
  const [itemDonationBusy, setItemDonationBusy] = useState(false);
  const [itemDonationForm, setItemDonationForm] = useState({
    phone: '', address: '', pickupLocation: '', mapUrl: '', latitude: '', longitude: '',
    preferredPickupDate: '', preferredPickupTime: '',
    items: [{ name: '', category: 'FOOD', quantity: '1', condition: 'NEW', description: '' }]
  });
  const [itemPhotos, setItemPhotos] = useState([]);
  const [financialUtilization, setFinancialUtilization] = useState(null);
  const [updates, setUpdates] = useState([]);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    let active = true;
    setCampaign(null);
    setError('');
    setPaymentError('');
    setPaymentOptions(null);
    setPaymentMethod('');
    setTransferIntentId('');
    setIntentKey('');
    api.get(`/campaigns/${id}`)
      .then((response) => {
        if (!active) return;
        const loadedCampaign = response.data.data.campaign;
        setCampaign(loadedCampaign);
        setFinancialUtilization(response.data.data.financialUtilization || null);
        setUpdates(response.data.data.updates || []);
        if (['MONEY', 'HYBRID'].includes(loadedCampaign.type || 'MONEY')) {
          setPaymentOptionsLoading(true);
          api.get(`/donations/options/${id}`)
            .then((optionsResponse) => {
              if (!active) return;
              const methods = optionsResponse.data.data.methods;
              setPaymentOptions(methods);
              const firstAvailable = ['ESEWA', 'BANK_TRANSFER', 'QR'].find((method) => methods[method]);
              setPaymentMethod(firstAvailable || '');
            })
            .catch((e) => {
              if (active) setPaymentError(e.response?.data?.message || 'Payment options are unavailable.');
            })
            .finally(() => {
              if (active) setPaymentOptionsLoading(false);
            });
        }
      })
      .catch((e) => {
        if (active) setError(e.response?.data?.message || 'Campaign could not be loaded.');
      });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    const result = searchParams.get('payment');
    if (result === 'success') setMessage('eSewa confirmed this donation. Thank you for supporting the campaign.');
    else if (result === 'pending') setMessage('The eSewa payment is still pending. You can check its status below.');
    else if (result === 'failed') setMessage('The eSewa payment was not completed. No donation was confirmed.');
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    if (user?.role !== 'CITIZEN') return () => { active = false; };
    api.get('/volunteers/mine')
      .then(({ data }) => {
        const application = data.data.items.find((item) => String(item.campaign?._id) === String(id));
        if (active && application) {
          setVolunteerApplied(true);
          setVolunteerMessage(`Your volunteer application is ${application.status.replaceAll('_', ' ').toLowerCase()}.`);
        }
      })
      .catch(() => {
        if (active) setVolunteerError('Could not check your existing volunteer application.');
      });
    return () => { active = false; };
  }, [id, user]);

  async function submitVolunteerApplication(event) {
    event.preventDefault();
    if (!user || user.role !== 'CITIZEN') {
      navigate('/login');
      return;
    }
    setBusy(true);
    setVolunteerError('');
    setVolunteerMessage('');
    try {
      await api.post('/volunteers', {
        campaignId: id,
        ...volunteerForm,
        preferredDates: volunteerForm.preferredDates.filter(Boolean)
      });
      setVolunteerApplied(true);
      setVolunteerMessage('Application submitted. The NGO will review your availability and send any offer through your account.');
      setVolunteerOpen(false);
    } catch (e) {
      setVolunteerError(e.response?.data?.message || 'Could not submit application.');
    } finally {
      setBusy(false);
    }
  }

  async function submitItemDonation(event) {
    event.preventDefault();
    if (!user || user.role !== 'CITIZEN') {
      navigate('/login');
      return;
    }
    setItemDonationBusy(true);
    setItemDonationError('');
    setItemDonationMessage('');
    const formData = new FormData();
    formData.append('campaignId', id);
    for (const field of ['phone', 'address', 'pickupLocation', 'mapUrl', 'latitude', 'longitude', 'preferredPickupDate', 'preferredPickupTime']) {
      formData.append(field, itemDonationForm[field]);
    }
    formData.append('items', JSON.stringify(itemDonationForm.items));
    itemPhotos.forEach((file) => formData.append('photos', file));
    try {
      const { data } = await api.post('/item-donations', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setItemDonationMessage(`Request ${data.data.request.reference} submitted. The NGO will contact you; items are not considered collected until confirmed.`);
      setItemDonationOpen(false);
      setItemPhotos([]);
      setItemDonationForm((previous) => ({
        ...previous,
        items: [{ name: '', category: 'FOOD', quantity: '1', condition: 'NEW', description: '' }]
      }));
    } catch (e) {
      setItemDonationError(e.response?.data?.message || 'Could not submit item donation request.');
    } finally {
      setItemDonationBusy(false);
    }
  }

  async function donate(event) {
    event.preventDefault();
    if (!user || user.role !== 'CITIZEN') {
      navigate('/login');
      return;
    }
    if (!paymentMethod || !Number.isFinite(Number(amount)) || Number(amount) < 1) {
      setPaymentError('Choose an available payment method and enter a valid amount.');
      return;
    }
    setBusy(true);
    setPaymentError('');
    setMessage('');
    try {
      const idempotencyKey = intentKey || window.crypto.randomUUID();
      setIntentKey(idempotencyKey);
      if (paymentMethod === 'ESEWA') {
        const intentResponse = await api.post('/donations', {
          campaignId: id,
          amount: Number(amount),
          provider: 'ESEWA'
        }, { headers: { 'Idempotency-Key': idempotencyKey } });
        const donation = intentResponse.data.data.donation;
        const { data } = await api.post(`/donations/${donation._id}/esewa/initiate`);
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.data.checkoutUrl;
        form.style.display = 'none';
        Object.entries(data.data.fields).forEach(([name, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = String(value);
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
        return;
      }

      let donationId = transferIntentId;
      if (!donationId) {
        const intentResponse = await api.post('/donations', {
          campaignId: id,
          amount: Number(amount),
          provider: paymentMethod
        }, { headers: { 'Idempotency-Key': idempotencyKey } });
        donationId = intentResponse.data.data.donation._id;
        setTransferIntentId(donationId);
      }
      const transfer = new FormData();
      transfer.append('transactionReference', transactionReference);
      if (proof) transfer.append('proof', proof);
      await api.post(`/donations/${donationId}/transfer`, transfer, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setTransferIntentId('');
      setIntentKey('');
      setTransactionReference('');
      setProof(null);
      setMessage('Transfer details submitted. Your donation remains pending until verified by the NGO or an authorized administrator.');
    } catch (e) {
      setPaymentError(e.response?.data?.message || 'Could not start or submit this donation.');
    } finally {
      setBusy(false);
    }
  }

  async function checkPaymentStatus() {
    const donationId = searchParams.get('donationId');
    if (!donationId) return;
    setBusy(true);
    setPaymentError('');
    try {
      const { data } = await api.post(`/donations/${donationId}/esewa/verify`);
      setMessage(data.data.donation.status === 'SUCCESS'
        ? 'eSewa confirmed this donation. Thank you.'
        : `eSewa reports this donation as ${data.data.donation.status}.`);
    } catch (e) {
      setPaymentError(e.response?.data?.message || 'Could not verify the eSewa transaction.');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <main className="container detail-shell"><div className="notice error">{error}</div><Link to="/campaigns" className="text-link"><ArrowLeft size={16}/> Back to campaigns</Link></main>;
  if (!campaign) return <main className="container loading-state">Loading campaign…</main>;

  const campaignType = campaign.type || 'MONEY';
  const includesMoney = ['MONEY', 'HYBRID'].includes(campaignType);
  const includesItems = ['PHYSICAL', 'HYBRID'].includes(campaignType);
  const targetAmount = Number(campaign.targetAmount || 0);
  const raisedAmount = Number(campaign.raisedAmount || financialUtilization?.confirmedDonations || 0);
  const fundraisingProgress = targetAmount > 0 ? Math.min((raisedAmount / targetAmount) * 100, 100) : 0;

  return <main className="container detail-shell">
    <Link to="/campaigns" className="text-link"><ArrowLeft size={16}/> All campaigns</Link>
    <div className="detail-layout">
      <section>
        <div className="detail-art">
          {campaign.coverImage
            ? <img src={imageSource(campaign, 'cover', campaign.coverImage)} alt={`${campaign.title} campaign`} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            : <HeartHandshake size={74}/>}
          <span className="art-label">{categoryLabels[campaign.category] || campaign.category || 'Relief campaign'}</span>
          <span className="detail-art-word">CARE IN ACTION</span>
        </div>
        <div className="detail-copy">
          <span className="section-kicker">{campaignType.replaceAll('_', ' ')} RELIEF CAMPAIGN</span>
          <h1>{campaign.title}</h1>
          <p className="campaign-ngo-verification"><ShieldCheck size={16}/><b>{campaign.ngo?.organizationName || 'Verified NGO'}</b>{campaign.ngo?.verificationStatus === 'VERIFIED' && <span className="status-badge">VERIFIED NGO</span>}</p>
          <div className="campaign-location">
            <MapPin size={16}/>{campaign.location || 'Nepal'}
            <span>·</span><CalendarDays size={16}/>
            {campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : 'Ongoing'}
          </div>
          <p>{campaign.description}</p>
          <dl className="detail-grid campaign-public-meta">
            <dt>Organization</dt><dd>{campaign.ngo?.organizationName || 'Verified NGO'}{campaign.ngo?.verificationStatus === 'VERIFIED' && <span className="status-badge">VERIFIED</span>}</dd>
            <dt>Campaign type</dt><dd>{campaignType}</dd>
            <dt>Category</dt><dd>{categoryLabels[campaign.category] || campaign.category}</dd>
            <dt>Status</dt><dd>{(campaign.status || campaign.publicationStatus || 'PUBLISHED').replaceAll('_', ' ')}</dd>
            {campaign.startDate && <><dt>Starts</dt><dd>{new Date(campaign.startDate).toLocaleDateString()}</dd></>}
            {campaign.endDate && <><dt>Ends</dt><dd>{new Date(campaign.endDate).toLocaleDateString()}</dd></>}
          </dl>

          {includesMoney && <section className="campaign-type-detail">
            <h3>Fundraising goal</h3>
            <p>NPR {targetAmount.toLocaleString('en-NP')}</p>
            <p>Raised: NPR {Number(campaign.raisedAmount || 0).toLocaleString('en-NP')}</p>
          </section>}

          {includesItems && <section className="campaign-type-detail">
            <h3><Package size={18}/> Items needed</h3>
            {campaign.requiredItems?.length
              ? <ul className="required-items-list">{campaign.requiredItems.map((item) => <li key={item._id || `${item.name}-${item.category}`}>
                <b>{item.name}</b>
                <span>{categoryLabels[item.category] || item.category}</span>
                <span>Required: {Number(item.requiredQuantity).toLocaleString('en-NP')}</span>
                <span>Received: {Number(item.receivedQuantity || 0).toLocaleString('en-NP')}</span>
                <span>Condition: {conditionLabels[item.acceptedCondition] || item.acceptedCondition || 'Any acceptable condition'}</span>
              </li>)}</ul>
              : <p>No item requirements are listed for this campaign.</p>}
            {campaign.collectionInstructions && <><h4>Collection instructions</h4><p>{campaign.collectionInstructions}</p></>}
          </section>}
          <section className="campaign-type-detail" aria-labelledby="fund-utilization-title">
            <h3 id="fund-utilization-title">Campaign Fund Utilization</h3>
            <div className="fund-utilization-stats">
              <span><small>Confirmed donations</small><b>NPR {Number(financialUtilization?.confirmedDonations || 0).toLocaleString('en-NP')}</b></span>
              <span><small>Approved expenses</small><b>NPR {Number(financialUtilization?.approvedExpenses || 0).toLocaleString('en-NP')}</b></span>
              <span><small>Remaining funds</small><b>NPR {Number(financialUtilization?.remainingFunds || 0).toLocaleString('en-NP')}</b></span>
            </div>
            {financialUtilization?.expenseBreakdown?.length > 0 && <div className="expense-breakdown">
              <h4>Approved expense breakdown</h4>
              {financialUtilization.expenseBreakdown.map((entry) => <p key={entry.category}>
                <span>{entry.category.replaceAll('_', ' ')}</span><b>NPR {Number(entry.amount).toLocaleString('en-NP')}</b>
              </p>)}
            </div>}
            {financialUtilization?.expenses?.length > 0 && <div className="public-expense-list">
              {financialUtilization.expenses.map((expense) => <article key={expense._id}>
                <div><b>{expense.title}</b><small>{expense.category.replaceAll('_', ' ')} · {new Date(expense.expenseDate).toLocaleDateString()}</small>
                  {expense.description && <p>{expense.description}</p>}</div>
                <div><strong>NPR {Number(expense.amount).toLocaleString('en-NP')}</strong>
                  {expense.receiptAvailable && <a className="text-link" href={`${api.defaults.baseURL.replace(/\/$/, '')}/relief/expenses/public/${expense._id}/receipt`} target="_blank" rel="noreferrer">View public receipt</a>}
                </div>
              </article>)}
            </div>}
            {!financialUtilization?.expenses?.length && <p className="muted">No approved expenses have been published for public review.</p>}
          </section>
          <section className="campaign-type-detail" aria-labelledby="campaign-updates-title">
            <h3 id="campaign-updates-title">Campaign Updates &amp; Impact</h3>
            {updates.length ? <div className="public-update-list">{updates.map((update) => <article key={update._id}>
              <h4>{update.title}</h4>
              <small>{new Date(update.activityDate).toLocaleDateString()} · {update.location} · {update.beneficiaryCount} beneficiaries</small>
              <p>{update.publicSummary}</p>
              {update.photos?.length > 0 && <div className="public-update-photos">{update.photos.map((photo) => <img
                key={photo._id}
                src={`${api.defaults.baseURL.replace(/\/$/, '')}/relief/activities/public/${update._id}/photos/${photo._id}`}
                alt={`${update.title} impact`}
                loading="lazy"
              />)}</div>}
            </article>)}</div> : <p className="muted">No campaign updates have been posted yet.</p>}
          </section>
          {message && <div className="notice">{message}</div>}
        </div>
      </section>

      <aside className="donation-panel">
        <span className="section-kicker">CAMPAIGN DETAILS</span>
        <div className="panel-stats">
          <span><MapPin size={17}/> {campaign.location || 'Nepal'}</span>
          <span><Users size={17}/> {campaign.acceptedVolunteerCount || 0} of {campaign.requiredVolunteers ?? 5} volunteers accepted · {campaign.remainingVolunteerSlots ?? campaign.requiredVolunteers ?? 5} places left</span>
          <span><CalendarDays size={17}/> {(campaign.status || 'PUBLISHED').replaceAll('_', ' ')}</span>
        </div>
        {includesMoney && <div>
          <div className="raised-amount">NPR {Number(campaign.raisedAmount || 0).toLocaleString('en-NP')}</div>
          <p>raised of NPR {targetAmount.toLocaleString('en-NP')} goal</p>
          <div className="campaign-progress-summary">
            <div className="progress-label"><span>Fundraising progress</span><strong>{fundraisingProgress.toFixed(1)}%</strong></div>
            <div className="progress-track large" role="progressbar" aria-label="Campaign fundraising progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(fundraisingProgress)}><span style={{ width: `${fundraisingProgress}%` }}/></div>
          </div>
          {paymentOptions?.BANK_TRANSFER && <div className="payment-details">
            <h3>Bank transfer details</h3>
            <p><b>{campaign.paymentDetails.bankName}</b></p>
            <p>Account name: {campaign.paymentDetails.accountName}</p>
            <p>Account number: {campaign.paymentDetails.accountNumber}</p>
            {campaign.paymentDetails.branch && <p>Branch: {campaign.paymentDetails.branch}</p>}
          </div>}
          {paymentOptions?.QR && <div className="payment-details">
            <h3>Scan campaign QR</h3>
            <img className="campaign-payment-qr" src={imageSource(campaign, 'qr', campaign.paymentDetails.qrImage || campaign.paymentDetails.qrImageUrl)} alt="Campaign payment QR code"/>
          </div>}
          {user?.role === 'CITIZEN' ? <>
            <form className="auth-form donation-form" onSubmit={donate}>
              <label>Donation amount (NPR)
                <input required type="number" min="1" max="100000000" step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setTransferIntentId(''); setIntentKey(''); }}/>
              </label>
              <label>Payment method
                <select required value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setTransferIntentId(''); setIntentKey(''); }}>
                  <option value="">Choose a method</option>
                  {paymentOptions?.ESEWA && <option value="ESEWA">eSewa</option>}
                  {paymentOptions?.BANK_TRANSFER && <option value="BANK_TRANSFER">Bank transfer</option>}
                  {paymentOptions?.QR && <option value="QR">QR payment</option>}
                </select>
              </label>
              {paymentMethod && paymentMethod !== 'ESEWA' && <>
                <label>Transaction reference<input required minLength="3" maxLength="120" value={transactionReference} onChange={(e) => setTransactionReference(e.target.value)}/></label>
                <label>Payment proof (optional; PDF, JPG or PNG, up to 5 MB)<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => setProof(e.target.files?.[0] || null)}/></label>
              </>}
              <button className="btn full-btn" type="submit" disabled={busy || paymentOptionsLoading || !paymentMethod}>
                <HeartHandshake size={17}/>{busy ? 'Processing…' : paymentMethod === 'ESEWA' ? 'Continue to eSewa' : 'Submit transfer for verification'}
              </button>
            </form>
            {paymentOptionsLoading && <p className="muted">Loading payment options…</p>}
            {!paymentOptionsLoading && paymentOptions && !paymentOptions.ESEWA && !paymentOptions.BANK_TRANSFER && !paymentOptions.QR &&
              <p className="notice">No payment methods are configured for this campaign.</p>}
          </> : user
            ? <p className="muted">Only Citizen accounts can make donations.</p>
            : <p className="muted"><Link className="text-link" to="/login">Sign in with a Citizen account to donate.</Link></p>}
        </div>}
        {includesItems && <div className="item-donation-entry">
          {user?.role === 'CITIZEN' ? <button className="btn btn-outline full-btn" type="button" onClick={() => setItemDonationOpen((value) => !value)}>
            <Package size={17}/>{itemDonationOpen ? 'Close item donation form' : 'Donate items'}
          </button> : <Link className="btn btn-outline full-btn" to="/login"><Package size={17}/> Sign in to donate items</Link>}
          {itemDonationMessage && <div className="notice">{itemDonationMessage}</div>}
          {itemDonationError && <div className="notice error">{itemDonationError}</div>}
          {itemDonationOpen && user?.role === 'CITIZEN' && <form className="auth-form item-donation-form" onSubmit={submitItemDonation}>
            <h3>Physical item donation request</h3>
            <p className="muted">{user.name} · {user.email}</p>
            <label>Phone<input required maxLength="30" value={itemDonationForm.phone || user.phone || ''} onChange={(e) => setItemDonationForm({ ...itemDonationForm, phone: e.target.value })}/></label>
            <label>Current address<textarea required rows={2} maxLength="500" value={itemDonationForm.address} onChange={(e) => setItemDonationForm({ ...itemDonationForm, address: e.target.value })}/></label>
            <label>Pickup location<input required maxLength="500" value={itemDonationForm.pickupLocation} onChange={(e) => setItemDonationForm({ ...itemDonationForm, pickupLocation: e.target.value })}/></label>
            <label>Google Maps link (optional)<input type="url" maxLength="2048" placeholder="https://maps.google.com/…" value={itemDonationForm.mapUrl} onChange={(e) => setItemDonationForm({ ...itemDonationForm, mapUrl: e.target.value })}/></label>
            <div className="inline-fields">
              <label>Latitude (optional)<input type="number" min="-90" max="90" step="any" value={itemDonationForm.latitude} onChange={(e) => setItemDonationForm({ ...itemDonationForm, latitude: e.target.value })}/></label>
              <label>Longitude (optional)<input type="number" min="-180" max="180" step="any" value={itemDonationForm.longitude} onChange={(e) => setItemDonationForm({ ...itemDonationForm, longitude: e.target.value })}/></label>
            </div>
            <fieldset className="item-requirements"><legend>Items to donate</legend>
              {itemDonationForm.items.map((item, index) => <div className="required-item-form" key={index}>
                <label>Item name<input required maxLength="120" value={item.name} onChange={(e) => setItemDonationForm({ ...itemDonationForm, items: itemDonationForm.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, name: e.target.value } : entry) })}/></label>
                <label>Category<select required value={item.category} onChange={(e) => setItemDonationForm({ ...itemDonationForm, items: itemDonationForm.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, category: e.target.value } : entry) })}>{Object.entries(categoryLabels).filter(([category]) => category !== 'FUNDRAISING').map(([category, label]) => <option value={category} key={category}>{label}</option>)}</select></label>
                <label>Quantity<input required type="number" min="1" max="100000" step="1" value={item.quantity} onChange={(e) => setItemDonationForm({ ...itemDonationForm, items: itemDonationForm.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: e.target.value } : entry) })}/></label>
                <label>Condition<select value={item.condition} onChange={(e) => setItemDonationForm({ ...itemDonationForm, items: itemDonationForm.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, condition: e.target.value } : entry) })}><option value="NEW">New</option><option value="GOOD">Good</option><option value="USED">Used</option></select></label>
                <label>Description (optional)<textarea rows={2} maxLength="1000" value={item.description} onChange={(e) => setItemDonationForm({ ...itemDonationForm, items: itemDonationForm.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: e.target.value } : entry) })}/></label>
                {itemDonationForm.items.length > 1 && <button className="btn btn-ghost btn-small" type="button" onClick={() => setItemDonationForm({ ...itemDonationForm, items: itemDonationForm.items.filter((_, itemIndex) => itemIndex !== index) })}>Remove item</button>}
              </div>)}
              {itemDonationForm.items.length < 10 && <button className="btn btn-ghost btn-small" type="button" onClick={() => setItemDonationForm({ ...itemDonationForm, items: [...itemDonationForm.items, { name: '', category: 'FOOD', quantity: '1', condition: 'NEW', description: '' }] })}><Plus size={15}/> Add another item</button>}
            </fieldset>
            <label>Preferred pickup date<input required type="date" min={new Date().toISOString().slice(0, 10)} value={itemDonationForm.preferredPickupDate} onChange={(e) => setItemDonationForm({ ...itemDonationForm, preferredPickupDate: e.target.value })}/></label>
            <label>Preferred pickup time<input required maxLength="120" placeholder="e.g. Weekdays after 3 PM" value={itemDonationForm.preferredPickupTime} onChange={(e) => setItemDonationForm({ ...itemDonationForm, preferredPickupTime: e.target.value })}/></label>
            <label>Item photos (optional; up to 5 JPG/PNG/WebP images)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setItemPhotos(Array.from(e.target.files || []).slice(0, 5))}/></label>
            <button className="btn full-btn" type="submit" disabled={itemDonationBusy}>{itemDonationBusy ? 'Submitting…' : 'Submit item donation request'}</button>
          </form>}
        </div>}
        {paymentError && <div className="notice error">{paymentError}</div>}
        {message && <div className="notice">{message}</div>}
        {searchParams.get('payment') === 'pending' && user?.role === 'CITIZEN' &&
          <button className="btn btn-ghost full-btn" type="button" disabled={busy} onClick={checkPaymentStatus}>
            {busy ? 'Checking…' : 'Check eSewa payment status'}
          </button>}
        {volunteerError && <div className="notice error">{volunteerError}</div>}
        {volunteerMessage && <div className="notice">{volunteerMessage}</div>}
        {user?.role === 'CITIZEN' && <div className="volunteer-application-entry">
          {campaign.volunteerCapacityFull
            ? <div className="notice">Volunteer positions are full.</div>
            : volunteerApplied
              ? <div className="notice">You have already applied to this campaign.</div>
              : <button className="btn btn-ghost full-btn" disabled={busy} onClick={() => {
                setVolunteerForm((form) => ({ ...form, phone: form.phone || user.phone || '' }));
                setVolunteerOpen((value) => !value);
              }}>{volunteerOpen ? 'Close volunteer application' : 'Apply to volunteer'} <span>↗</span></button>}
          {volunteerOpen && !volunteerApplied && !campaign.volunteerCapacityFull && <form className="auth-form volunteer-application-form" onSubmit={submitVolunteerApplication}>
            <h3>Volunteer application</h3>
            <label>Full name<input readOnly value={user.name || ''}/></label>
            <label>Email address<input readOnly type="email" value={user.email || ''}/></label>
            <label>Phone<input required maxLength="30" value={volunteerForm.phone} onChange={(e) => setVolunteerForm({ ...volunteerForm, phone: e.target.value })}/></label>
            <label>Campaign<input readOnly value={campaign.title}/></label>
            <label>Why do you want to volunteer?<textarea required rows={3} maxLength="1000" value={volunteerForm.message} onChange={(e) => setVolunteerForm({ ...volunteerForm, message: e.target.value })}/></label>
            <label>Relevant skills or experience<textarea rows={2} maxLength="2000" value={volunteerForm.skills} onChange={(e) => setVolunteerForm({ ...volunteerForm, skills: e.target.value })}/></label>
            <div className="preferred-dates">
              <span className="field-label">Preferred volunteering dates</span>
              {volunteerForm.preferredDates.map((date, index) => <div className="inline-fields" key={index}>
                <input required={index === 0} type="date" value={date} onChange={(e) => setVolunteerForm({ ...volunteerForm, preferredDates: volunteerForm.preferredDates.map((item, itemIndex) => itemIndex === index ? e.target.value : item) })}/>
                {volunteerForm.preferredDates.length > 1 && <button className="btn btn-ghost btn-small" type="button" onClick={() => setVolunteerForm({ ...volunteerForm, preferredDates: volunteerForm.preferredDates.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>}
              </div>)}
              {volunteerForm.preferredDates.length < 10 && <button className="btn btn-ghost btn-small" type="button" onClick={() => setVolunteerForm({ ...volunteerForm, preferredDates: [...volunteerForm.preferredDates, ''] })}><Plus size={15}/> Add a date</button>}
            </div>
            <label>Available days and time<input required maxLength="1000" placeholder="e.g. Saturdays and Sundays, 9 AM–2 PM" value={volunteerForm.availability} onChange={(e) => setVolunteerForm({ ...volunteerForm, availability: e.target.value })}/></label>
            <label>Expected hours or commitment<input required maxLength="120" placeholder="e.g. 4 hours per week" value={volunteerForm.commitmentHours} onChange={(e) => setVolunteerForm({ ...volunteerForm, commitmentHours: e.target.value })}/></label>
            <label>Current location<input required maxLength="300" value={volunteerForm.currentLocation} onChange={(e) => setVolunteerForm({ ...volunteerForm, currentLocation: e.target.value })}/></label>
            <label>Additional message<textarea rows={2} maxLength="2000" value={volunteerForm.additionalMessage} onChange={(e) => setVolunteerForm({ ...volunteerForm, additionalMessage: e.target.value })}/></label>
            <button className="btn full-btn" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Review and submit application'}</button>
          </form>}
        </div>}
        {user?.role === 'CITIZEN' && <small>One Citizen account supports both giving and volunteering.</small>}
      </aside>
    </div>
  </main>;
}
