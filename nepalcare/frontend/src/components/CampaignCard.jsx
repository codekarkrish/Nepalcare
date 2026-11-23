import { useEffect, useState } from 'react';
import { MapPin, ArrowUpRight, Heart, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api';

function CampaignArt({ campaign }) {
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => setUnavailable(false), [campaign._id, campaign.coverImage]);
  const hasCover = Boolean(campaign.coverImage) && !unavailable;
  const src = !campaign.coverImage ? '' : /^https?:\/\//i.test(campaign.coverImage)
    ? campaign.coverImage
    : `${api.defaults.baseURL.replace(/\/$/, '')}/campaigns/${campaign._id}/images/cover`;
  return <div className={`campaign-art${hasCover ? ' has-cover' : ''}`}>
    {hasCover && <img className="campaign-cover-image" src={src} alt="" loading="lazy" onError={() => setUnavailable(true)}/>}
    {!hasCover && <><div className="art-orb orb-one"/><div className="art-orb orb-two"/><Heart className="art-heart" size={25}/><span className="art-initial">{(campaign.title || 'N').slice(0, 1)}</span></>}
    <span className="art-label">{campaign.category || 'Community relief'}</span>
  </div>;
}

export default function CampaignCard({ campaign }) {
  const target = Number(campaign.targetAmount || 0), raised = Number(campaign.raisedAmount || 0);
  const progress = target ? Math.min(100, Math.round(raised / target * 100)) : 0;
  return <article className="campaign-card">
    <CampaignArt campaign={campaign}/>
    <div className="campaign-content"><div className="eyebrow"><span className="live-dot"/>{(campaign.status || 'APPROVED').replaceAll('_',' ')} · {campaign.type || 'MONEY'}</div><h3>{campaign.title}</h3><p className="campaign-description">{campaign.description || 'Supporting communities with accountable, community-led relief.'}</p><div className="campaign-location"><MapPin size={15}/>{campaign.location || 'Nepal'}</div>
      {campaign.ngo?.organizationName && <div className="campaign-ngo"><ShieldCheck size={14}/><span>{campaign.ngo.organizationName}</span>{campaign.ngo.verificationStatus === 'VERIFIED' && <small>Verified NGO</small>}</div>}
      {['MONEY', 'HYBRID'].includes(campaign.type || 'MONEY') && <><div className="progress-label"><span>NPR {raised.toLocaleString('en-NP')} raised</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{width:`${progress}%`}}/></div><div className="campaign-bottom"><span>Goal <b>NPR {target.toLocaleString('en-NP')}</b></span><Link to={`/campaigns/${campaign._id}`} className="text-link">View campaign <ArrowUpRight size={16}/></Link></div></>}
      {!['MONEY', 'HYBRID'].includes(campaign.type) && <div className="campaign-bottom"><span>Physical relief</span><Link to={`/campaigns/${campaign._id}`} className="text-link">View campaign <ArrowUpRight size={16}/></Link></div>}
    </div>
  </article>;
}
