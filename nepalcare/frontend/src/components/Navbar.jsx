import { HeartHandshake, Menu, X, LogOut, LayoutDashboard } from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
export default function Navbar() {
  const { user, logout } = useAuth(); const [open, setOpen] = useState(false); const navigate = useNavigate(); const location = useLocation();
  const canAdminReview = (permission) => user?.adminLevel === 'MAIN_ADMIN' || user?.permissions?.includes(permission);
  const donorSectionClass = (hash) => ({ isActive }) => {
    if (user?.role === 'CITIZEN' && location.pathname === '/dashboard') {
      return location.hash === hash ? 'active' : '';
    }
    return isActive ? 'active' : '';
  };
  function signOut() { logout(); setOpen(false); navigate('/'); }
  return <header className="nav-wrap"><nav className="nav container">
    <Link to="/" className="brand"><span className="brand-mark"><HeartHandshake size={22}/><svg className="brand-flag" viewBox="0 0 24 32" aria-hidden="true"><path fill="#003893" d="M1 1h6l16 10.5L7 19l16 10.5H1z"/><path fill="#dc143c" d="M3 4v11l14-3.5zM3 17v9l14-4.5z"/><circle cx="7" cy="10" r="2" fill="#fff"/><circle cx="7" cy="23" r="2" fill="#fff"/></svg></span><span>Nepal<span className="brand-accent">Care</span><small>TRUST IN EVERY CONTRIBUTION</small></span></Link>
    <button className="mobile-menu" onClick={() => setOpen(!open)} aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="primary-navigation">{open ? <X/> : <Menu/>}</button>
    <div id="primary-navigation" className={`nav-links ${user ? 'role-links' : ''} ${open ? 'nav-open' : ''}`}>
      {user?.role === 'NGO' ? <>
        <NavLink to="/dashboard" onClick={() => setOpen(false)}>Dashboard</NavLink>
        <NavLink to="/ngo/campaigns" onClick={() => setOpen(false)}>My Campaigns</NavLink>
        <NavLink to="/ngo/volunteers" onClick={() => setOpen(false)}>Volunteer Applications</NavLink>
        <NavLink to="/ngo/item-donations" onClick={() => setOpen(false)}>Item Donation Requests</NavLink>
        <NavLink to="/ngo/donations" onClick={() => setOpen(false)}>Donations</NavLink>
        <NavLink to="/ngo/reports" onClick={() => setOpen(false)}>Financial Reports</NavLink>
        <NavLink to="/ngo/profile" onClick={() => setOpen(false)}>NGO Profile</NavLink>
        <button className="nav-logout" onClick={signOut}><LogOut size={16}/> Sign out</button>
      </> : user ? <>
        {user.role === 'ADMIN' ? <>
          <NavLink to="/dashboard" end onClick={() => setOpen(false)}>Overview</NavLink>
          {canAdminReview('ngo.review') && <NavLink to="/admin/ngos" onClick={() => setOpen(false)}>NGO reviews</NavLink>}
          {canAdminReview('campaign.review') && <NavLink to="/admin/campaigns" onClick={() => setOpen(false)}>Campaign reviews</NavLink>}
          {canAdminReview('donation.review') && <NavLink to="/admin/donations" onClick={() => setOpen(false)}>Donations</NavLink>}
          {canAdminReview('expense.review') && <NavLink to="/admin/expenses" onClick={() => setOpen(false)}>Expenses</NavLink>}
          {canAdminReview('campaign.deletion.review') && <NavLink to="/admin/campaign-deletions" onClick={() => setOpen(false)}>Deletion requests</NavLink>}
          <button className="nav-logout" onClick={signOut}><LogOut size={16}/> Sign out</button>
        </> : user.role === 'CITIZEN' && <>
          <NavLink to="/campaigns" onClick={() => setOpen(false)}>Explore campaigns</NavLink>
          <NavLink to="/dashboard#my-donations" end className={donorSectionClass('#my-donations')} onClick={() => setOpen(false)}>My Donations</NavLink>
          <NavLink to="/dashboard#my-volunteering" end className={donorSectionClass('#my-volunteering')} onClick={() => setOpen(false)}>My Volunteering</NavLink>
          <NavLink to="/dashboard#my-item-donations" end className={donorSectionClass('#my-item-donations')} onClick={() => setOpen(false)}>My Item Donations</NavLink>
          <Link to="/dashboard" onClick={() => setOpen(false)}><LayoutDashboard size={16}/> Dashboard</Link>
          <button className="nav-logout" onClick={signOut}><LogOut size={16}/> Sign out</button>
        </>}
      </> : <>
        <NavLink to="/campaigns" onClick={() => setOpen(false)}>Explore campaigns</NavLink>
        <Link to="/login" onClick={() => setOpen(false)}>Log in</Link>
        <Link className="btn btn-small" to="/register" onClick={() => setOpen(false)}>Join NepalCare <span>↗</span></Link>
      </>}
    </div>
  </nav></header>;
}
