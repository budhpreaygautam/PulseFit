import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Check,
  QrCode,
  AlertCircle,
  XCircle
} from 'lucide-react';
import { User, MembershipTier, MembershipStatus } from '../../types/index.js';
import { api } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { Modal } from '../../components/common/Modal.js';
import { useToast } from '../../context/ToastContext.js';

export const MemberManagement: React.FC = () => {
  const [members, setMembers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<User | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Form fields for Add
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTier, setNewTier] = useState<MembershipTier>('pro');

  const { showToast } = useToast();

  const fetchMembers = async () => {
    setIsLoading(true);
    try {
      const list = await api.getMembers({
        search: searchQuery,
        tier: tierFilter,
        status: statusFilter
      });
      setMembers(list);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [tierFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMembers();
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createMember({
        name: newName,
        email: newEmail,
        phone: newPhone,
        membership_tier: newTier
      });
      showToast(`Member "${newName}" created successfully! Default password: ${res.tempPassword}`, 'success');
      setIsAddModalOpen(false);
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      fetchMembers();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    try {
      await api.updateMember(editingMember.id, {
        name: editingMember.name,
        phone: editingMember.phone,
        membership_tier: editingMember.membership_tier,
        membership_status: editingMember.membership_status,
        membership_expiry: editingMember.membership_expiry
      });
      showToast('Member profile updated', 'success');
      setEditingMember(null);
      fetchMembers();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteMember = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove member ${name}? This will revoke their turnstile access.`)) {
      return;
    }

    try {
      await api.deleteMember(id);
      showToast(`Member "${name}" removed`, 'info');
      fetchMembers();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    showToast('Member QR token copied', 'info');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <Badge variant="cyan">MEMBER ROSTER</Badge>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight mt-2 font-['Outfit']">
            MEMBERSHIP DIRECTORY
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
            Manage athlete subscriptions, update access statuses, and issue digital turnstile passes for Cyber Hub Gurugram.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-5 py-3 sm:px-6 sm:py-3.5 bg-lime-500 hover:bg-lime-400 text-black font-black text-xs rounded-xl shadow-glow-lime flex items-center gap-2 shrink-0 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> Register New Member
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or pass ID..."
            className="w-full pl-10 pr-4 py-2 bg-gym-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-lime-500"
          />
        </form>

        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          {/* Tier filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Tier:</span>
            <select
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value)}
              className="bg-gym-950 border border-slate-700 text-xs text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-lime-500"
            >
              <option value="All">All Tiers</option>
              <option value="basic">Standard (₹1,499)</option>
              <option value="pro">Pro (₹2,499)</option>
              <option value="vip">VIP (₹3,999)</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-gym-950 border border-slate-700 text-xs text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-lime-500"
            >
              <option value="All">All Statuses</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="frozen">Frozen</option>
            </select>
          </div>

          <button
            onClick={fetchMembers}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl"
          >
            Apply Filters
          </button>
        </div>
      </div>

      {/* Member Data Table */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gym-950/80 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-4 pl-6">Athlete Profile</th>
                <th className="p-4">Contact Info</th>
                <th className="p-4">Turnstile QR Token</th>
                <th className="p-4">Membership Plan</th>
                <th className="p-4">Status</th>
                <th className="p-4">Valid Thru</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    Loading member roster...
                  </td>
                </tr>
              ) : members.length > 0 ? (
                members.map(member => (
                  <tr key={member.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Athlete Name & Avatar */}
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <img
                          src={member.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`}
                          alt={member.name}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-700 bg-slate-800 shrink-0"
                        />
                        <div>
                          <div className="font-extrabold text-sm text-white flex items-center gap-1.5">
                            {member.name}
                            {member.role === 'admin' && (
                              <span className="text-[9px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded font-mono">
                                ADMIN
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">Streak: {member.streak_days || 0}d</div>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="p-4">
                      <div className="text-slate-200">{member.email}</div>
                      <div className="text-[10px] text-slate-500">{member.phone}</div>
                    </td>

                    {/* QR Code Pass Token */}
                    <td className="p-4">
                      <div className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg font-mono text-[11px] text-slate-300">
                        <QrCode className="w-3.5 h-3.5 text-lime-400" />
                        <span>{member.qr_code_token}</span>
                        <button
                          onClick={() => handleCopyToken(member.qr_code_token)}
                          className="text-slate-500 hover:text-slate-200 p-0.5"
                          title="Copy Pass Code"
                        >
                          {copiedToken === member.qr_code_token ? (
                            <Check className="w-3 h-3 text-lime-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Tier */}
                    <td className="p-4">
                      <Badge
                        variant={member.membership_tier === 'vip' ? 'amber' : member.membership_tier === 'pro' ? 'lime' : 'cyan'}
                        size="sm"
                      >
                        {member.membership_tier.toUpperCase()}
                      </Badge>
                    </td>

                    {/* Status */}
                    <td className="p-4">
                      {member.membership_status === 'active' ? (
                        <span className="inline-flex items-center gap-1.5 text-lime-400 font-bold bg-lime-500/10 px-2.5 py-0.5 rounded-full border border-lime-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse-dot" /> Active
                        </span>
                      ) : member.membership_status === 'expired' ? (
                        <span className="inline-flex items-center gap-1.5 text-rose-400 font-bold bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/30">
                          <XCircle className="w-3 h-3" /> Expired
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-amber-400 font-bold bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                          <AlertCircle className="w-3 h-3" /> Frozen
                        </span>
                      )}
                    </td>

                    {/* Expiry */}
                    <td className="p-4 font-mono text-slate-400 text-xs">
                      {member.membership_expiry}
                    </td>

                    {/* Actions */}
                    <td className="p-4 pr-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingMember(member)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                          title="Edit Member"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteMember(member.id, member.name)}
                          className="p-1.5 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                          title="Delete Member"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    No members found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New Member Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register New Gym Member"
        description="Create account credentials and issue an automated encrypted turnstile token."
        maxWidth="md"
      >
        <form onSubmit={handleAddMember} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Aarav Sharma"
              className="w-full px-3.5 py-2 bg-gym-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="aarav@example.com"
              className="w-full px-3.5 py-2 bg-gym-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              placeholder="+91 98110 12345"
              className="w-full px-3.5 py-2 bg-gym-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Membership Tier
            </label>
            <select
              value={newTier}
              onChange={e => setNewTier(e.target.value as MembershipTier)}
              className="w-full px-3.5 py-2 bg-gym-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-lime-500"
            >
              <option value="basic">Standard Pass (₹1,499/mo)</option>
              <option value="pro">Performance Pro (₹2,499/mo)</option>
              <option value="vip">Elite VIP (₹3,999/mo)</option>
            </select>
          </div>

          <div className="flex gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-lime-500 hover:bg-lime-400 text-black font-extrabold text-xs rounded-xl shadow-glow-lime"
            >
              Register & Generate Pass
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Member Modal */}
      {editingMember && (
        <Modal
          isOpen={!!editingMember}
          onClose={() => setEditingMember(null)}
          title={`Edit Member: ${editingMember.name}`}
          maxWidth="md"
        >
          <form onSubmit={handleUpdateMember} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={editingMember.name}
                onChange={e => setEditingMember({ ...editingMember, name: e.target.value })}
                className="w-full px-3.5 py-2 bg-gym-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-lime-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={editingMember.phone || ''}
                onChange={e => setEditingMember({ ...editingMember, phone: e.target.value })}
                className="w-full px-3.5 py-2 bg-gym-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-lime-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Membership Tier
                </label>
                <select
                  value={editingMember.membership_tier}
                  onChange={e => setEditingMember({ ...editingMember, membership_tier: e.target.value as MembershipTier })}
                  className="w-full px-3 py-2 bg-gym-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-lime-500"
                >
                  <option value="basic">Standard (₹1,499)</option>
                  <option value="pro">Pro (₹2,499)</option>
                  <option value="vip">VIP (₹3,999)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Account Status
                </label>
                <select
                  value={editingMember.membership_status}
                  onChange={e => setEditingMember({ ...editingMember, membership_status: e.target.value as MembershipStatus })}
                  className="w-full px-3 py-2 bg-gym-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-lime-500"
                >
                  <option value="active">Active</option>
                  <option value="frozen">Frozen</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                Expiry Date (YYYY-MM-DD)
              </label>
              <input
                type="date"
                value={editingMember.membership_expiry}
                onChange={e => setEditingMember({ ...editingMember, membership_expiry: e.target.value })}
                className="w-full px-3.5 py-2 bg-gym-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-lime-500"
              />
            </div>

            <div className="flex gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-lime-500 hover:bg-lime-400 text-black font-extrabold text-xs rounded-xl shadow-glow-lime"
              >
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
