import React, { useState, useRef } from 'react';
import {
  User,
  CreditCard,
  QrCode,
  CheckCircle2,
  Copy,
  Check,
  Award,
  KeyRound,
  Download,
  Upload,
  Image as ImageIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { api } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { MembershipTier, MembershipStatus } from '../../types/index.js';
import { DigitalQrPassModal } from '../../components/qr/DigitalQrPassModal.js';

interface MemberProfilePageProps {
  setCurrentTab: (tab: string) => void;
}

export const MemberProfilePage: React.FC<MemberProfilePageProps> = ({ setCurrentTab }) => {
  const { user, refreshUser, triggerCelebration, updateUser, changePassword } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'details' | 'membership' | 'billing' | 'security'>('details');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Profile Edit State
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  // Hidden File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password Edit State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Avatar presets
  const avatarPresets = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=300&auto=format&fit=crop&q=80'
  ];

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center space-y-4">
        <h3 className="text-2xl font-bold text-white font-['Outfit']">Please sign in to manage your profile.</h3>
        <button
          onClick={() => setCurrentTab('home')}
          className="px-6 py-2.5 neu-btn-lime text-black font-extrabold text-xs rounded-xl shadow-glow-lime"
        >
          Return Home
        </button>
      </div>
    );
  }

  // Handle Local Image File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (PNG, JPG, WebP, GIF)', 'warning');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size exceeds 5MB limit', 'warning');
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = () => {
      const base64 = reader.result as string;
      setAvatarUrl(base64);
      setIsUploading(false);
      showToast('Profile picture loaded! Click "Save Profile Details" to save changes.', 'success');
    };

    reader.onerror = () => {
      setIsUploading(false);
      showToast('Failed to read image file', 'error');
    };

    reader.readAsDataURL(file);
  };

  const handleApplyCustomUrl = () => {
    if (!customUrlInput.trim()) return;
    setAvatarUrl(customUrlInput.trim());
    setCustomUrlInput('');
    setShowUrlInput(false);
    showToast('Custom image URL applied!', 'info');
  };

  const handleResetToDicebear = () => {
    const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name)}`;
    setAvatarUrl(defaultAvatar);
    showToast('Reset to default generated avatar.', 'info');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.updateProfile({
        name,
        phone,
        avatar_url: avatarUrl
      });
      await refreshUser();
      showToast('Profile information and picture updated successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update profile', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Plan changes are paid through checkout on the pricing page.
  const handleChangeTier = async (newTier: MembershipTier) => {
    if (newTier === user.membership_tier) return;
    setCurrentTab('pricing');
  };

  const handleToggleFreeze = async () => {
    const nextStatus: MembershipStatus = user.membership_status === 'frozen' ? 'active' : 'frozen';
    try {
      updateUser(nextStatus === 'frozen' ? await api.freezeMembership() : await api.unfreezeMembership());
      showToast(
        nextStatus === 'frozen'
          ? 'Membership frozen. Turnstile access is paused.'
          : 'Membership reactivated! Welcome back.',
        'info'
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters', 'warning');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'warning');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(currentPassword || undefined, newPassword);
      showToast('Password changed successfully!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showToast(err.message || 'Failed to change password', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleCopyPass = () => {
    navigator.clipboard.writeText(user.qr_code_token);
    setCopiedToken(true);
    showToast('Pass token copied to clipboard', 'info');
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const getTierPrice = () => {
    if (user.membership_tier === 'vip') return '₹1,999.00';
    if (user.membership_tier === 'pro') return '₹1,499.00';
    return '₹1,199.00';
  };

  const mockInvoices = [
    { id: 'INV-2026-0901', date: 'Sep 01, 2026', amount: getTierPrice(), status: 'Paid', method: 'UPI (GPay/PhonePe)', plan: `${user.membership_tier.toUpperCase()} Monthly Pass` },
    { id: 'INV-2026-0801', date: 'Aug 01, 2026', amount: getTierPrice(), status: 'Paid', method: 'Razorpay •••• 4242', plan: `${user.membership_tier.toUpperCase()} Monthly Pass` },
    { id: 'INV-2026-0701', date: 'Jul 01, 2026', amount: getTierPrice(), status: 'Paid', method: 'Razorpay •••• 4242', plan: `${user.membership_tier.toUpperCase()} Monthly Pass` }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-10">
      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/png, image/jpeg, image/webp, image/gif"
        className="hidden"
      />

      {/* 1. Header Profile Banner */}
      <div className="relative rounded-3xl overflow-hidden neu-flat border border-slate-800/80 p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4 sm:gap-5">
            {/* Avatar with Interactive Upload */}
            <div className="relative group/avatar shrink-0">
              <img
                src={avatarUrl || user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`}
                alt={user.name}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover bg-slate-800 border-2 border-lime-500/50 shadow-glow-lime group-hover/avatar:brightness-75 transition-all"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity bg-black/60 rounded-2xl text-lime-400 font-bold text-[10px]"
                title="Upload Photo"
              >
                <Upload className="w-5 h-5 mb-0.5" />
                <span>Upload</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-3xl font-black text-white font-['Outfit']">{user.name}</h1>
                <Badge
                  variant={user.membership_tier === 'vip' ? 'amber' : user.membership_tier === 'pro' ? 'lime' : 'cyan'}
                >
                  {user.membership_tier.toUpperCase()} ATHLETE
                </Badge>
                {user.membership_status === 'active' ? (
                  <span className="text-xs bg-lime-500/10 text-lime-400 font-bold px-2.5 py-0.5 rounded-full border border-lime-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse-dot" /> Active Access
                  </span>
                ) : (
                  <span className="text-xs bg-amber-500/10 text-amber-400 font-bold px-2.5 py-0.5 rounded-full border border-amber-500/30">
                    {user.membership_status.toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-medium">
                {user.email} • Phone: {user.phone || 'Not set'} • Turnstile Pass: <strong className="text-slate-200 font-mono">{user.qr_code_token}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 neu-btn text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center gap-2"
            >
              <Upload className="w-3.5 h-3.5 text-lime-400" />
              Upload Photo
            </button>

            <button
              onClick={() => setIsQrModalOpen(true)}
              className="px-5 py-2.5 neu-btn-lime text-black font-extrabold text-xs rounded-xl transition-all flex items-center gap-2 shadow-glow-lime"
            >
              <QrCode className="w-3.5 h-3.5" />
              Digital Pass
            </button>
          </div>
        </div>
      </div>

      {/* 2. Profile Management Tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl neu-pressed-sm border border-slate-800/80 overflow-x-auto">
        {[
          { id: 'details', label: 'Personal Information & Picture', icon: <User className="w-4 h-4" /> },
          { id: 'membership', label: 'Plan & Subscription', icon: <Award className="w-4 h-4" /> },
          { id: 'billing', label: 'Invoices & Billing', icon: <CreditCard className="w-4 h-4" /> },
          { id: 'security', label: 'Security & Password', icon: <KeyRound className="w-4 h-4" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'neu-btn-lime text-black font-extrabold shadow-glow-lime'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* 3. Tab Contents */}
      {/* Tab 1: Personal Details & Picture Upload */}
      {activeTab === 'details' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 neu-flat p-6 sm:p-8 rounded-3xl border border-slate-800/80 space-y-6">
            <div className="border-b border-slate-800/80 pb-4">
              <h3 className="text-lg font-black text-white font-['Outfit']">Personal Profile & Picture</h3>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">Upload your own photo or choose from preset avatars.</p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-6">
              {/* Profile Photo Uploader Card */}
              <div className="p-4 sm:p-5 rounded-2xl neu-pressed-sm space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-lime-400" /> Profile Picture
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">PNG, JPG, WebP, GIF (Max 5MB)</span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
                  <img
                    src={avatarUrl || user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`}
                    alt="Current Avatar"
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-lime-500/60 bg-slate-800 shrink-0 shadow-lg"
                  />

                  <div className="flex-1 space-y-2 text-center sm:text-left w-full">
                    <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="px-4 py-2 neu-btn-lime text-black font-extrabold text-xs rounded-xl shadow-glow-lime transition-all flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {isUploading ? 'Uploading...' : 'Upload Image'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowUrlInput(!showUrlInput)}
                        className="px-3.5 py-2 neu-btn text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
                      >
                        URL
                      </button>

                      <button
                        type="button"
                        onClick={handleResetToDicebear}
                        className="px-3.5 py-2 neu-btn text-slate-400 hover:text-slate-200 font-bold text-xs rounded-xl transition-all"
                        title="Reset Avatar"
                      >
                        Reset
                      </button>
                    </div>

                    {showUrlInput && (
                      <div className="flex items-center gap-2 pt-2 animate-in fade-in">
                        <input
                          type="url"
                          value={customUrlInput}
                          onChange={e => setCustomUrlInput(e.target.value)}
                          placeholder="https://example.com/photo.jpg"
                          className="flex-1 px-3 py-2 neu-pressed-sm rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-lime-500 font-medium"
                        />
                        <button
                          type="button"
                          onClick={handleApplyCustomUrl}
                          className="px-4 py-2 neu-btn-lime text-black text-xs font-bold rounded-xl shrink-0"
                        >
                          Apply
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Presets */}
                <div className="pt-3 border-t border-slate-800/80 space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Or Choose an Athletic Preset:
                  </span>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {avatarPresets.map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAvatarUrl(url)}
                        className={`w-11 h-11 rounded-xl overflow-hidden border-2 transition-all ${
                          avatarUrl === url
                            ? 'border-lime-400 scale-105 shadow-glow-lime'
                            : 'border-slate-700/60 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={url} alt={`Avatar preset ${idx}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Form Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-4 py-2.5 neu-pressed-sm rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-lime-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+91 98110 12345"
                    className="w-full px-4 py-2.5 neu-pressed-sm rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-lime-500 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Email Address (Primary Login)
                </label>
                <input
                  type="email"
                  disabled
                  value={user.email}
                  className="w-full px-4 py-2.5 neu-pressed-sm rounded-xl text-sm text-slate-400 cursor-not-allowed opacity-75 font-medium"
                />
                <p className="text-[10px] text-slate-500 mt-1 font-medium">To change your primary email, contact member support.</p>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-3 neu-btn-lime text-black font-extrabold text-xs rounded-xl shadow-glow-lime transition-all active:scale-95 disabled:opacity-50"
              >
                {isSaving ? 'Saving Changes...' : 'Save Profile Details'}
              </button>
            </form>
          </div>

          {/* Quick Turnstile Pass Card */}
          <div className="lg:col-span-4 neu-flat p-6 rounded-3xl border border-slate-800/80 space-y-4">
            <h3 className="text-sm font-extrabold text-white font-['Outfit'] flex items-center gap-2">
              <QrCode className="w-4 h-4 text-lime-400" />
              Turnstile Access Token
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed font-medium">
              Your turnstile pass code is encrypted and tied to your active membership.
            </p>

            <div className="p-3.5 neu-pressed-sm rounded-xl flex items-center justify-between font-mono text-xs text-slate-200">
              <span className="truncate font-bold">{user.qr_code_token}</span>
              <button
                onClick={handleCopyPass}
                className="p-1 text-slate-400 hover:text-slate-100 transition-colors ml-2"
                title="Copy Pass"
              >
                {copiedToken ? <Check className="w-4 h-4 text-lime-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <button
              onClick={() => setIsQrModalOpen(true)}
              className="w-full py-2.5 neu-btn text-slate-200 text-xs font-bold rounded-xl transition-all"
            >
              Open Full Digital Badge
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Plan & Subscription Management */}
      {activeTab === 'membership' && (
        <div className="space-y-8">
          <div className="neu-flat p-6 sm:p-8 rounded-3xl border border-slate-800/80 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div>
                <h3 className="text-lg font-black text-white font-['Outfit']">Manage Membership Tier</h3>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">
                  Upgrade or switch your pass anytime. Changes take effect immediately.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleToggleFreeze}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    user.membership_status === 'frozen'
                      ? 'neu-btn-lime text-black shadow-glow-lime font-extrabold'
                      : 'neu-btn'
                  }`}
                >
                  {user.membership_status === 'frozen' ? 'Reactivate Membership' : 'Freeze Membership (60 Days)'}
                </button>
              </div>
            </div>

            {/* Tier Selector Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  id: 'basic' as MembershipTier,
                  name: 'Workout & Strength Pass',
                  price: '₹1,199/mo',
                  desc: 'Full Gym floor, free weights, and strength workout sessions.',
                  features: ['Full Gym Floor & Strength Training', 'Barbells, Racks & Dumbbells', 'Daily Workout Set Logger & Time Tracker', 'Digital QR Turnstile Pass']
                },
                {
                  id: 'pro' as MembershipTier,
                  name: 'Zumba & Cardio Pass',
                  price: '₹1,499/mo',
                  desc: 'Unlimited high-energy Zumba dance and cardio classes.',
                  features: ['Unlimited Zumba & Cardio Sessions', 'Dance Studio & Aerobic Floor', 'Locker Room & Showers', 'Digital QR Turnstile Pass']
                },
                {
                  id: 'vip' as MembershipTier,
                  name: 'Dual All-Access Pass',
                  price: '₹1,999/mo',
                  desc: 'Unlimited Strength Training AND Zumba Cardio sessions.',
                  features: ['Unlimited Strength & Free Weights Floor', 'Unlimited Zumba & Cardio Dance Classes', '1 Monthly Coach Form Assessment', 'Priority Spot Reservation']
                }
              ].map(plan => {
                const isCurrent = user.membership_tier === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={`p-6 rounded-3xl neu-flat flex flex-col justify-between transition-all ${
                      isCurrent
                        ? 'border-2 border-lime-500 shadow-glow-lime'
                        : 'border border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm text-white font-['Outfit']">{plan.name}</span>
                        {isCurrent && (
                          <Badge variant="lime" size="sm">
                            ACTIVE PLAN
                          </Badge>
                        )}
                      </div>

                      <div className="text-3xl font-black text-white font-['Outfit']">{plan.price}</div>
                      <p className="text-xs text-slate-400 leading-relaxed font-medium">{plan.desc}</p>

                      <div className="space-y-2 pt-3 border-t border-slate-800/80 text-xs text-slate-300 font-medium">
                        {plan.features.map((f, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-lime-400 shrink-0" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleChangeTier(plan.id)}
                      disabled={isCurrent}
                      className={`w-full mt-6 py-2.5 rounded-xl font-extrabold text-xs transition-all ${
                        isCurrent
                          ? 'neu-pressed-sm text-slate-500 cursor-default font-bold'
                          : 'neu-btn-lime text-black shadow-glow-lime active:scale-95'
                      }`}
                    >
                      {isCurrent ? 'Current Selection' : `Switch to ${plan.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Billing & Invoices */}
      {activeTab === 'billing' && (
        <div className="neu-flat p-6 sm:p-8 rounded-3xl border border-slate-800/80 space-y-6">
          <div className="border-b border-slate-800/80 pb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-white font-['Outfit']">Payment & Billing History</h3>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">Download automated GST tax invoices.</p>
            </div>
            <Badge variant="lime" size="sm">AUTO-RENEW ON</Badge>
          </div>

          <div className="overflow-x-auto rounded-2xl neu-pressed-sm p-1">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800/80 text-slate-400 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-4 pl-6">Invoice #</th>
                  <th className="p-4">Billing Date</th>
                  <th className="p-4">Plan Description</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Payment Method</th>
                  <th className="p-4 pr-6 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {mockInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 pl-6 font-mono font-bold text-slate-200">{inv.id}</td>
                    <td className="p-4 text-slate-400">{inv.date}</td>
                    <td className="p-4 text-white font-semibold">{inv.plan}</td>
                    <td className="p-4 font-mono font-bold text-lime-400">{inv.amount}</td>
                    <td className="p-4 text-slate-400">{inv.method}</td>
                    <td className="p-4 pr-6 text-right">
                      <button
                        onClick={() => showToast(`Receipt ${inv.id} downloaded!`, 'success')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 neu-btn text-slate-200 rounded-lg text-xs font-semibold transition-all"
                      >
                        <Download className="w-3.5 h-3.5 text-lime-400" />
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Security & Password */}
      {activeTab === 'security' && (
        <div className="max-w-2xl neu-flat p-6 sm:p-8 rounded-3xl border border-slate-800/80 space-y-6">
          <div className="border-b border-slate-800/80 pb-4">
            <h3 className="text-lg font-black text-white font-['Outfit']">Account Security</h3>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">Update your password to keep your member account secure.</p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 neu-pressed-sm rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-lime-500 font-medium"
              />
              <p className="text-[10px] text-slate-500 mt-1 font-medium">Default demo password is: <strong className="text-slate-300 font-mono">pulse123</strong></p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 neu-pressed-sm rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-lime-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 neu-pressed-sm rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-lime-500 font-medium"
              />
            </div>

            <button
              type="submit"
              disabled={isChangingPassword}
              className="px-6 py-3 neu-btn-lime text-black font-extrabold text-xs rounded-xl shadow-glow-lime transition-all active:scale-95 disabled:opacity-50"
            >
              {isChangingPassword ? 'Updating Password...' : 'Change Password'}
            </button>
          </form>
        </div>
      )}

      {/* Digital QR Pass Modal */}
      <DigitalQrPassModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        user={user}
      />
    </div>
  );
};
