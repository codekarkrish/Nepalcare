import { useEffect, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import api from '../services/api';
import CampaignCard from '../components/CampaignCard';
export default function Campaigns() {
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[query,setQuery]=useState(''),[category,setCategory]=useState(''),[type,setType]=useState(''),[error,setError]=useState('');
 useEffect(()=>{api.get('/campaigns?limit=50').then(r=>setItems(r.data.data.items || [])).catch(()=>setError('Unable to load campaigns. Check that the backend and MongoDB are running.')).finally(()=>setLoading(false));},[]);
 const filtered=items.filter(c=>
  `${c.title} ${c.category} ${c.location}`.toLowerCase().includes(query.toLowerCase()) &&
  (!category || c.category === category) &&
  (!type || (c.type || 'MONEY') === type)
 );
 const categories = ['FOOD','CLOTHES','BLANKETS','EDUCATION','BOOKS','STATIONERY','UTENSILS','MEDICAL','DISASTER_RELIEF','FUNDRAISING','OTHER'];
 return <main className="page-shell"><section className="page-hero container"><span className="section-kicker">COMMUNITY IN ACTION · NEPAL</span><h1>Find a cause worth<br/><em>showing up for.</em></h1><p>Explore approved relief campaigns and discover how you can help.</p>
   <div className="campaign-discovery-controls">
    <label className="search-box"><Search size={19}/><input aria-label="Search campaigns" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search campaigns, causes, locations…"/></label>
    <label className="campaign-filter"><SlidersHorizontal size={16}/><span>Category</span><select aria-label="Filter by category" value={category} onChange={e=>setCategory(e.target.value)}><option value="">All causes</option>{categories.map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label>
    <label className="campaign-filter"><span>Campaign type</span><select aria-label="Filter by campaign type" value={type} onChange={e=>setType(e.target.value)}><option value="">All types</option><option value="MONEY">Money</option><option value="PHYSICAL">Physical items</option><option value="HYBRID">Money + items</option></select></label>
   </div>
  </section><section className="container list-section">{loading?<div className="loading-state">Loading campaigns…</div>:error?<div className="notice error">{error}</div>:filtered.length?<div className="campaign-grid">{filtered.map(c=><CampaignCard key={c._id} campaign={c}/>)}</div>:<div className="empty-campaigns"><div className="empty-icon"><Search/></div><h3>No campaigns found</h3><p>Try a different search or cause, or check back as new campaigns are approved.</p></div>}</section></main>;
}
