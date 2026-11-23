import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Campaigns from './pages/Campaigns';
import CampaignDetail from './pages/CampaignDetail';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import { AuthProvider, useAuth } from './context/AuthContext';
function Protected({children,roles}){const {user,loading}=useAuth();const location=useLocation();if(loading)return <div className="loading-state">Loading your account…</div>;if(!user)return <Navigate to="/login" replace state={{from:location.pathname}}/>;if(roles&&!roles.includes(user.role))return <Navigate to="/dashboard" replace/>;return children;}
function AppLayout(){return <><Navbar/><Routes><Route path="/" element={<Home/>}/><Route path="/campaigns" element={<Campaigns/>}/><Route path="/campaigns/:id" element={<CampaignDetail/>}/><Route path="/login" element={<Auth/>}/><Route path="/register" element={<Auth mode="register"/>}/><Route path="/dashboard" element={<Protected><Dashboard/></Protected>}/><Route path="/admin/*" element={<Protected roles={['ADMIN']}><Dashboard/></Protected>}/><Route path="/ngo/*" element={<Protected roles={['NGO']}><Dashboard/></Protected>}/><Route path="*" element={<main className="container not-found"><h1>That page wandered off.</h1><p>Let's get you back to helping.</p><a className="btn" href="/">Back home</a></main>}/></Routes><Footer/></>}
export default function App(){return <AuthProvider><AppLayout/></AuthProvider>}
