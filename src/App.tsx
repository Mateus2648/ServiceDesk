/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, Component, useRef } from 'react';
import { 
  LayoutDashboard, 
  Ticket as TicketIcon, 
  Users, 
  Settings, 
  LogOut, 
  Plus, 
  Search, 
  Filter, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  MessageSquare,
  User as UserIcon,
  ChevronRight,
  ArrowLeft,
  Send,
  ShieldCheck,
  BarChart3,
  Loader2,
  AlertTriangle,
  UserCog,
  UserMinus,
  UserPlus,
  Trash2,
  Check,
  ShieldAlert,
  Wrench,
  X,
  Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { 
  cn, 
  type User, 
  type Ticket, 
  type TicketInteraction, 
  type TicketStatus, 
  type Priority,
  type Role,
  analyzeTicketWithAI
} from './types';
import { SECRETARIAS } from './constants';
import { supabase, signInWithGoogle, signOut } from './supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { Toaster, toast } from 'sonner';

// --- ERROR BOUNDARY ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Ops! Algo deu errado.</h2>
            <p className="text-slate-500 mb-6">Ocorreu um erro inesperado no sistema. Por favor, tente recarregar a página.</p>
            <pre className="bg-slate-50 p-4 rounded-xl text-xs text-left overflow-auto mb-6 max-h-40 text-slate-400">
              {JSON.stringify(this.state.error, null, 2)}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              Recarregar Sistema
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- COMPONENTS ---

const StatusBadge = ({ status }: { status: TicketStatus }) => {
  const config = {
    OPEN: { label: 'Aberto', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    IN_PROGRESS: { label: 'Em Andamento', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    WAITING: { label: 'Aguardando', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    FINISHED: { label: 'Finalizado', color: 'bg-green-100 text-green-700 border-green-200' },
  };
  const { label, color } = config[status];
  return <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border", color)}>{label}</span>;
};

const PriorityBadge = ({ priority }: { priority: Priority }) => {
  const config = {
    LOW: { label: 'Baixa', color: 'text-gray-500' },
    MEDIUM: { label: 'Média', color: 'text-orange-500' },
    HIGH: { label: 'Alta', color: 'text-red-500' },
  };
  const { label, color } = config[priority];
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("w-2 h-2 rounded-full", priority === 'HIGH' ? 'bg-red-500' : priority === 'MEDIUM' ? 'bg-orange-500' : 'bg-gray-400')} />
      <span className={cn("text-xs font-medium uppercase tracking-wider", color)}>{label}</span>
    </div>
  );
};

// --- MAIN APP ---

function HelpDeskApp() {
  const notificationTimeouts = useRef<Record<string, any>>({});
  const notificationBuffer = useRef<Record<string, { messages: string[], subjects: Set<string> }>>({});
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState<'dashboard' | 'tickets' | 'detail' | 'techs' | 'admins' | 'users' | 'reports'>('dashboard');
  const [tickets, setTickets] = useState<Ticket[]>([]);

  const [ticketViews, setTicketViews] = useState<any[]>([]);
  const [interactions, setInteractions] = useState<TicketInteraction[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  type ViewType = 'dashboard' | 'tickets' | 'detail' | 'techs' | 'admins' | 'users' | 'reports';

  const navigateTo = async (newView: ViewType, ticketId: string | null = null) => {
    setView(newView);
    setSelectedTicketId(ticketId);
    window.history.pushState({ view: newView, ticketId }, '', '');
    if (ticketId) {
      await markAsViewed(ticketId);
    }
  };

  const markAsViewed = async (ticketId: string) => {
    if (!currentUser) return;
    
    // Upsert (insere ou atualiza) a data de visualização
    const { data, error } = await supabase
      .from('ticket_views')
      .upsert({ 
        user_id: currentUser.id, 
        ticket_id: ticketId, 
        last_viewed_at: new Date().toISOString() 
      }, { onConflict: 'user_id, ticket_id' })
      .select()
      .single();
      
    if (!error && data) {
      setTicketViews(prev => [...prev.filter(v => v.ticket_id !== ticketId), data]);
    }
  };

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state) {
        if (event.state.view) setView(event.state.view);
        if (event.state.ticketId !== undefined) setSelectedTicketId(event.state.ticketId);
      } else {
        setView('dashboard');
        setSelectedTicketId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.history.replaceState({ view: 'dashboard', ticketId: null }, '', '');

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);
  const [isNewTechModalOpen, setIsNewTechModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<TicketStatus | 'ALL'>('ALL');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [techs, setTechs] = useState<User[]>([]);
  const [admins, setAdmins] = useState<User[]>([]);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [regularUsers, setRegularUsers] = useState<User[]>([]);
  const [allProfiles, setAllProfiles] = useState<User[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Auth Listener
  useEffect(() => {
    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setIsAuthReady(true);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setUserProfile(null);
        setIsAuthReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Current User Profile Real-time Listener
  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase
      .channel(`profile:${currentUser.id}`)
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'profiles', 
          filter: `id=eq.${currentUser.id}` 
        },
        (payload) => {
          console.log("Profile updated in real-time:", payload.new);
          setUserProfile(payload.new as User);
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [currentUser]);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist, create it
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        
        const user = userData.user;
        if (user) {
          const newProfile: User = {
            id: user.id,
            full_name: user.user_metadata.full_name || user.email?.split('@')[0] || 'Usuário',
            email: user.email || '',
            role: 'PENDING',
            secretariat: 'Geral'
          };
          
          const { error: insertError } = await supabase.from('profiles').insert([newProfile]);
          if (insertError) {
            console.error("Error creating profile (check RLS):", insertError);
            // If insert fails, we might still want to show the UI with a temporary profile
            // but it's better to let the user know.
            throw insertError;
          }
          setUserProfile(newProfile);
        }
      } else if (error) {
        throw error;
      } else {
        setUserProfile(data as User);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setIsAuthReady(true);
    }
  };

  const fetchStaff = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['TECH', 'ADMIN']);
    
    if (error) console.error("Error fetching staff:", error);
    else {
      const staff = data as User[];
      setTechs(staff.filter(u => u.role === 'TECH'));
      setAdmins(staff.filter(u => u.role === 'ADMIN'));
    }
  };

  const fetchPendingUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'PENDING');
    
    if (error) console.error("Error fetching pending users:", error);
    else setPendingUsers(data as User[]);
  };

  const fetchRegularUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'USER');
    
    if (error) console.error("Error fetching regular users:", error);
    else setRegularUsers(data as User[]);
  };

  // Techs Listener
  useEffect(() => {
    if (!isAuthReady || !currentUser || (userProfile?.role !== 'ADMIN' && userProfile?.role !== 'TECH')) return;

    fetchStaff();
    fetchPendingUsers();
    fetchRegularUsers();
  }, [isAuthReady, currentUser, userProfile]);

  // General Profiles Listener
  useEffect(() => {
    if (!isAuthReady || !currentUser) return;

    fetchAllProfiles();
    fetchTicketViews();

    const channel = supabase
      .channel('profiles_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
        console.log("Real-time profile profile change detected:", payload);
        if (payload.new && (payload.new as User).id === currentUser.id) {
          setUserProfile(payload.new as User);
        }
        fetchAllProfiles();
        
        // Only fetch staff/pending if user is admin/tech
        if (userProfile?.role === 'ADMIN' || userProfile?.role === 'TECH') {
          fetchStaff();
          fetchPendingUsers();
          fetchRegularUsers();
        }
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [isAuthReady, currentUser, userProfile]);

  const fetchTicketViews = async () => {
    if (!currentUser) return;
    const { data } = await supabase
      .from('ticket_views')
      .select('*')
      .eq('user_id', currentUser.id);
    if (data) setTicketViews(data);
  };

  const fetchAllProfiles = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name');
    
    if (error) console.error("Error fetching all profiles:", error);
    else setAllProfiles(data as User[]);
  };

  const fetchTickets = useCallback(async () => {
    if (!currentUser || !userProfile) return;
    let query = supabase.from('tickets').select('*').order('created_at', { ascending: false });
    
    if (userProfile.role === 'USER') {
      query = query.eq('created_by', currentUser.id);
    }

    const { data, error } = await query;
    if (error) console.error("Error fetching tickets:", error);
    else setTickets(data as Ticket[]);
  }, [currentUser, userProfile]);

  const fetchInteractions = useCallback(async () => {
    if (!selectedTicketId) return;
    const { data, error } = await supabase
      .from('interactions')
      .select('*')
      .eq('ticket_id', selectedTicketId)
      .order('created_at', { ascending: true });
    
    if (error) console.error("Error fetching interactions:", error);
    else setInteractions(data as TicketInteraction[]);
  }, [selectedTicketId]);

  // Tickets Listener
  useEffect(() => {
    if (!isAuthReady || !currentUser || !userProfile) return;

    fetchTickets();

    const channel = supabase
      .channel('public:tickets')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'tickets' 
      }, (payload) => {
        console.log("Real-time ticket change detected:", payload);
        // Optimistic update from remote change
        if (payload.eventType === 'INSERT') {
          const newTicket = payload.new as Ticket;
          if (userProfile.role !== 'USER' || newTicket.created_by === currentUser.id) {
            setTickets(prev => {
              if (prev.find(t => t.id === newTicket.id)) return prev;
              return [newTicket, ...prev];
            });
          }
        } else if (payload.eventType === 'UPDATE') {
          setTickets(prev => prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t));
        } else if (payload.eventType === 'DELETE') {
          setTickets(prev => prev.filter(t => t.id === payload.old.id));
        }
        fetchTickets();
      })
      .subscribe((status) => {
        console.log("Tickets real-time status:", status);
      });

    return () => { channel.unsubscribe(); };
  }, [isAuthReady, currentUser, userProfile, fetchTickets]);

  // Interactions Listener
  useEffect(() => {
    if (!selectedTicketId) {
      setInteractions([]);
      return;
    }

    fetchInteractions();

    const channel = supabase
      .channel(`interactions_${selectedTicketId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'interactions', 
        filter: `ticket_id=eq.${selectedTicketId}` 
      }, (payload) => {
        console.log("Real-time interaction change detected:", payload);
        fetchInteractions();
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [selectedTicketId, fetchInteractions]);

  const selectedTicket = useMemo(() => tickets.find(t => t.id === selectedTicketId), [tickets, selectedTicketId]);

  const stats = useMemo(() => {
    const byPriority = [
      { name: 'Baixa', value: tickets.filter(t => t.priority === 'LOW').length, color: '#94A3B8' },
      { name: 'Média', value: tickets.filter(t => t.priority === 'MEDIUM').length, color: '#F59E0B' },
      { name: 'Alta', value: tickets.filter(t => t.priority === 'HIGH').length, color: '#EF4444' },
    ];

    const techPerformance = techs.map(tech => ({
      name: tech.full_name,
      total: tickets.filter(t => t.assigned_to === tech.id).length,
      finished: tickets.filter(t => t.assigned_to === tech.id && t.status === 'FINISHED').length,
    })).sort((a, b) => b.total - a.total);

    return {
      total: tickets.length,
      open: tickets.filter(t => t.status === 'OPEN').length,
      inProgress: tickets.filter(t => t.status === 'IN_PROGRESS').length,
      waiting: tickets.filter(t => t.status === 'WAITING').length,
      finished: tickets.filter(t => t.status === 'FINISHED').length,
      byCategory: [
        { name: 'Hardware', value: tickets.filter(t => t.category === 'Hardware').length },
        { name: 'Software', value: tickets.filter(t => t.category === 'Software').length },
        { name: 'Rede', value: tickets.filter(t => t.category === 'Rede').length },
        { name: 'Telefonia', value: tickets.filter(t => t.category === 'Telefonia').length },
        { name: 'Outros', value: tickets.filter(t => t.category === 'Outros').length },
      ].filter(c => c.value > 0),
      byPriority,
      techPerformance
    };
  }, [tickets, techs]);

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const title = t.title || '';
      const description = t.description || '';
      const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === 'ALL' || t.status === filterStatus;
      
      // Secretariat filtering:
      // Users only see tickets from their own secretariat.
      // Admins and Techs see all tickets.
      const matchesSecretariat = 
        userProfile?.role === 'ADMIN' || 
        userProfile?.role === 'TECH' || 
        t.secretariat === userProfile?.secretariat;

      return matchesSearch && matchesStatus && matchesSecretariat;
    });
  }, [tickets, searchQuery, filterStatus, userProfile]);

  const filteredTechs = useMemo(() => {
    return techs.filter(t => 
      (t.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (t.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.secretariat || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [techs, searchQuery]);

  const filteredAdmins = useMemo(() => {
    return admins.filter(a => 
      (a.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (a.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.secretariat || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [admins, searchQuery]);

  const filteredUsers = useMemo(() => {
    return regularUsers.filter(u => 
      (u.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.secretariat || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [regularUsers, searchQuery]);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error("Login failed:", error);
      toast.error("Erro ao fazer login: " + error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigateTo('dashboard');
      toast.success('Logout realizado com sucesso');
    } catch (error: any) {
      console.error("Logout failed:", error);
      toast.error("Erro ao fazer logout: " + error.message);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: Role) => {
    // Search in all possible lists to find the user
    const targetUser = allProfiles.find(p => p.id === userId) || 
                       pendingUsers.find(p => p.id === userId) ||
                       techs.find(p => p.id === userId) ||
                       admins.find(p => p.id === userId) ||
                       regularUsers.find(p => p.id === userId);

    if (!targetUser) {
      console.error("User not found for update:", userId);
      return;
    }

    const isAuthorized = 
      userProfile?.role === 'ADMIN' || 
      (userProfile?.role === 'TECH' && newRole === 'USER' && targetUser.role === 'PENDING');

    if (!isAuthorized) {
      toast.error("Você não tem permissão para realizar esta ação.");
      return;
    }
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);
      
      if (error) throw error;
      
      // Audit Log
      await supabase.from('audit_logs').insert([{
        user_id: currentUser?.id,
        action: 'ROLE_UPDATED',
        new_state: { userId, newRole, previousRole: targetUser.role }
      }]);
      toast.success(`Usuário atualizado para ${newRole === 'ADMIN' ? 'Administrador' : newRole === 'TECH' ? 'Técnico' : 'Usuário'} com sucesso`);
    } catch (error: any) {
      console.error("Error updating role:", error);
      toast.error("Erro ao atualizar usuário: " + error.message);
    }
  };

  const handleRejectUser = async (userId: string) => {
    if (userProfile?.role !== 'ADMIN' && userProfile?.role !== 'TECH') {
      toast.error("Você não tem permissão para realizar esta ação.");
      return;
    }

    if (!window.confirm("Tem certeza que deseja rejeitar esta solicitação? O usuário será desativado e não poderá mais solicitar acesso.")) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: 'INACTIVE' })
        .eq('id', userId);
      
      if (error) throw error;
      
      // Audit Log
      await supabase.from('audit_logs').insert([{
        user_id: currentUser?.id,
        action: 'USER_REJECTED',
        new_state: { userId }
      }]);
      toast.success('Solicitação de usuário rejeitada com sucesso');
    } catch (error: any) {
      console.error("Error rejecting user:", error);
      toast.error("Erro ao rejeitar usuário: " + error.message);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (userProfile?.role !== 'ADMIN') {
      toast.error("Apenas administradores podem desativar usuários do sistema.");
      return;
    }

    if (!window.confirm("Tem certeza que deseja desativar este usuário? O histórico de chamados e mensagens será mantido, mas o usuário perderá o acesso ao sistema e não aparecerá mais nas listas de usuários ativos.")) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: 'INACTIVE' })
        .eq('id', userId);
      
      if (error) throw error;
      
      // Audit Log
      await supabase.from('audit_logs').insert([{
        user_id: currentUser?.id,
        action: 'USER_DEACTIVATED',
        new_state: { userId }
      }]);
      toast.success('Usuário desativado com sucesso');
    } catch (error: any) {
      console.error("Error deactivating user:", error);
      toast.error("Erro ao desativar usuário: " + error.message);
    }
  };

  const handleUpdateSecretariat = async (userId: string, newSecretariat: string) => {
    if (userProfile?.role !== 'ADMIN') return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ secretariat: newSecretariat })
        .eq('id', userId);
      
      if (error) throw error;
      
      // Audit Log
      await supabase.from('audit_logs').insert([{
        user_id: currentUser?.id,
        action: 'SECRETARIAT_UPDATED',
        new_state: { userId, newSecretariat }
      }]);
      toast.success('Secretaria atualizada com sucesso');
    } catch (error: any) {
      console.error("Error updating secretariat:", error);
      toast.error('Erro ao atualizar secretaria: ' + error.message);
    }
  };

  const sendNotification = (ticketId: string, subject: string, message: string) => {
    // Initialize buffer for this ticket if it doesn't exist
    if (!notificationBuffer.current[ticketId]) {
      notificationBuffer.current[ticketId] = { messages: [], subjects: new Set() };
    }

    // Add to buffer
    notificationBuffer.current[ticketId].messages.push(message);
    notificationBuffer.current[ticketId].subjects.add(subject);

    // Clear existing timeout
    if (notificationTimeouts.current[ticketId]) {
      clearTimeout(notificationTimeouts.current[ticketId]);
    }

    // Set new timeout (10 minutes)
    notificationTimeouts.current[ticketId] = setTimeout(() => {
      executeNotification(ticketId);
    }, 300000);
  };

  const executeNotification = async (ticketId: string) => {
    const buffer = notificationBuffer.current[ticketId];
    if (!buffer) return;

    const consolidatedMessages = buffer.messages.join('<br/><br/>');
    const subjects = Array.from(buffer.subjects);
    const consolidatedSubject = subjects.length > 1 ? 'Múltiplas Atualizações' : subjects[0];
    
    // Clear buffer and timeout reference before starting async work
    delete notificationBuffer.current[ticketId];
    delete notificationTimeouts.current[ticketId];

    try {
      // Fetch latest ticket state to ensure accuracy
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .single();
      
      if (ticketError || !ticket) return;

      let currentProfiles = allProfiles;
      if (currentProfiles.length === 0) {
        const { data, error } = await supabase.from('profiles').select('*');
        if (!error && data) {
          currentProfiles = data as User[];
          setAllProfiles(currentProfiles);
        }
      }

      const creator = currentProfiles.find(p => p.id === ticket.created_by);
      const technician = currentProfiles.find(p => p.id === ticket.assigned_to);

      const recipients = [];
      if (creator?.email) recipients.push(creator.email);
      if (technician?.email) recipients.push(technician.email);

      const uniqueRecipients = [...new Set(recipients)];
      if (uniqueRecipients.length === 0) return;

      const statusMap: Record<string, string> = {
        'OPEN': 'Aberto',
        'IN_PROGRESS': 'Em Atendimento',
        'WAITING': 'Aguardando',
        'FINISHED': 'Concluído',
        'CANCELED': 'Cancelado'
      };

      const statusLabel = statusMap[ticket.status] || ticket.status;
      const statusColor = ticket.status === 'FINISHED' ? '#10b981' : 
                          ticket.status === 'IN_PROGRESS' ? '#2563eb' : 
                          ticket.status === 'WAITING' ? '#f59e0b' : '#64748b';

      const response = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: uniqueRecipients,
          subject: `[CPD Guaranésia] ${consolidatedSubject} - Chamado #${ticketId.slice(0, 8)}`,
          html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              <div style="background-color: #2563eb; padding: 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.5px;">Service Desk CPD Guaranésia</h1>
              </div>
              
              <div style="padding: 32px; color: #1f2937;">
                <h2 style="margin-top: 0; color: #111827; font-size: 18px; font-weight: 600;">Olá,</h2>
                <p style="font-size: 16px; color: #4b5563; margin-bottom: 24px;">Houve novas movimentações no seu chamado. Confira os detalhes abaixo:</p>
                
                <div style="background-color: #f9fafb; border-left: 4px solid #2563eb; padding: 20px; border-radius: 4px; margin-bottom: 24px;">
                  <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Chamado</p>
                  <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #111827;">${ticket.title}</p>
                  
                  <div style="display: flex; align-items: center;">
                    <div style="margin-right: 20px;">
                      <p style="margin: 0 0 4px 0; font-size: 14px; color: #6b7280; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Status</p>
                      <span style="display: inline-block; padding: 4px 12px; background-color: ${statusColor}; color: #ffffff; border-radius: 9999px; font-size: 12px; font-weight: 600;">${statusLabel}</span>
                    </div>
                    <div>
                      <p style="margin: 0 0 4px 0; font-size: 14px; color: #6b7280; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">ID</p>
                      <p style="margin: 0; font-size: 14px; font-family: monospace; color: #374151;">#${ticketId.slice(0, 8)}</p>
                    </div>
                  </div>
                </div>

                <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; border: 1px solid #dbeafe;">
                  <div style="font-size: 15px; color: #1e40af; line-height: 1.6;">${consolidatedMessages}</div>
                </div>

                <div style="margin-top: 32px; text-align: center;">
                  <a href="${window.location.origin}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Acessar Painel do Chamado</a>
                </div>
              </div>

              <div style="background-color: #f3f4f6; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0; font-size: 12px; color: #6b7280;">Este é um e-mail automático do sistema de Service Desk CPD Guaranésia.</p>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #6b7280;">Por favor, não responda a este e-mail.</p>
                <div style="margin-top: 16px; font-size: 11px; color: #9ca3af;">
                  &copy; ${new Date().getFullYear()} Prefeitura Municipal de Guaranésia - CPD
                </div>
              </div>
            </div>
          `
        })
      });

      if (!response.ok) {
        const result = await response.json();
        console.error("Erro na notificação:", result.error);
      }
    } catch (error) {
      console.error("Erro ao enviar notificação:", error);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser || !userProfile) return;

    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    
    setIsAnalyzing(true);
    const aiAnalysis = await analyzeTicketWithAI(title, description);
    setIsAnalyzing(false);

    const newTicket = {
      title,
      description,
      priority: (aiAnalysis?.priority as Priority) || (formData.get('priority') as Priority),
      category: aiAnalysis?.category || (formData.get('category') as string),
      status: 'OPEN',
      created_by: currentUser.id,
      secretariat: userProfile.secretariat || 'Geral',
      ai_suggestion: aiAnalysis?.suggestion || ''
    };

    try {
      const { data, error } = await supabase.from('tickets').insert([newTicket]).select().single();
      if (error) throw error;
      
      // Audit Log
      await supabase.from('audit_logs').insert([{
        ticket_id: data.id,
        user_id: currentUser.id,
        action: 'TICKET_CREATED',
        new_state: data
      }]);

      setIsNewTicketModalOpen(false);
      toast.success('Chamado criado com sucesso');
    } catch (error: any) {
      console.error("Error creating ticket:", error);
      toast.error('Erro ao criar chamado: ' + error.message);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedTicketId || !currentUser) return;
    
    const newInteraction = {
      ticket_id: selectedTicketId,
      user_id: currentUser.id,
      content,
      is_internal: false
    };

    try {
      const { error: interactionError } = await supabase.from('interactions').insert([newInteraction]);
      if (interactionError) throw interactionError;
      
      // Fallback: fetch interactions immediately in case real-time is delayed
      fetchInteractions();

      // Update ticket updated_at (do not throw if this fails, as the interaction was already saved)
      await supabase.from('tickets').update({
        updated_at: new Date().toISOString()
      }).eq('id', selectedTicketId);
      
      sendNotification(selectedTicketId, 'Nova Mensagem', `Uma nova mensagem foi adicionada ao chamado: <br/><br/><i>"${content}"</i>`);
      toast.success('Mensagem enviada com sucesso');
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast.error("Erro ao enviar mensagem: " + error.message);
    }
  };

  const handleUpdateStatus = async (newStatus: TicketStatus) => {
    if (!selectedTicketId || !currentUser || !userProfile || !selectedTicket) return;
    
    // Restrictions:
    // 1. Technicians can only change status of tickets assigned to them
    // 2. Technicians cannot reopen FINISHED tickets
    if (userProfile.role === 'TECH') {
      if (selectedTicket.assigned_to !== currentUser.id) {
        toast.error("Você só pode alterar o status de chamados atribuídos a você.");
        return;
      }
      if (selectedTicket.status === 'FINISHED' && newStatus !== 'FINISHED') {
        toast.error("Chamados finalizados não podem ser reabertos por técnicos.");
        return;
      }
    }

    try {
      const previousState = { ...selectedTicket };
      const updatedAt = new Date().toISOString();
      
      // Optimistic Update
      setTickets(prev => prev.map(t => t.id === selectedTicketId ? { ...t, status: newStatus, updated_at: updatedAt } : t));

      const { error } = await supabase.from('tickets').update({
        status: newStatus,
        updated_at: updatedAt
      }).eq('id', selectedTicketId);

      if (error) throw error;

      // Audit Log
      await supabase.from('audit_logs').insert([{
        ticket_id: selectedTicketId,
        user_id: currentUser.id,
        action: 'STATUS_UPDATED',
        previous_state: previousState,
        new_state: { ...previousState, status: newStatus, updated_at: updatedAt }
      }]);
      
      const statusMap: Record<string, string> = {
        'OPEN': 'Aberto',
        'IN_PROGRESS': 'Em Atendimento',
        'WAITING': 'Aguardando',
        'FINISHED': 'Concluído',
        'CANCELED': 'Cancelado'
      };
      
      const translatedStatus = statusMap[newStatus] || newStatus;
      
      // Interaction Log (System Message)
      await supabase.from('interactions').insert([{
        ticket_id: selectedTicketId,
        user_id: currentUser.id,
        content: `SYSTEM_LOG:O status do chamado foi alterado para: ${translatedStatus}`,
        is_internal: false
      }]);

      sendNotification(selectedTicketId, 'Status Atualizado', `O status do chamado foi alterado para: <strong>${translatedStatus}</strong>`);
      toast.success('Status do chamado atualizado com sucesso');
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error('Erro ao atualizar status do chamado');
      // Revert on error
      fetchTickets();
    }
  };

  const handleUpdateAssignment = async (techId: string) => {
    if (!selectedTicketId || !currentUser || !userProfile || !selectedTicket) return;

    // Restrictions:
    // 1. Only ADMINs can reassign tickets
    if (userProfile.role === 'TECH') {
      toast.error("Apenas administradores podem alterar a atribuição de técnicos.");
      return;
    }

    try {
      const previousState = { ...selectedTicket };
      const updatedAt = new Date().toISOString();

      // Optimistic Update
      setTickets(prev => prev.map(t => t.id === selectedTicketId ? { ...t, assigned_to: techId || null, updated_at: updatedAt } : t));

      const { error } = await supabase.from('tickets').update({
        assigned_to: techId || null,
        updated_at: updatedAt
      }).eq('id', selectedTicketId);

      if (error) throw error;

      // Interaction Log (System Message)
      const techName = allProfiles.find(p => p.id === techId)?.full_name || 'Nenhum';
      await supabase.from('interactions').insert([{
        ticket_id: selectedTicketId,
        user_id: currentUser.id,
        content: techId ? `SYSTEM_LOG:Chamado atribuído ao técnico: ${techName}` : 'SYSTEM_LOG:Atribuição do chamado removida',
        is_internal: false
      }]);

      // Audit Log
      await supabase.from('audit_logs').insert([{
        ticket_id: selectedTicketId,
        user_id: currentUser.id,
        action: 'ASSIGNMENT_UPDATED',
        previous_state: previousState,
        new_state: { ...previousState, assigned_to: techId, updated_at: updatedAt }
      }]);

      const tech = allProfiles.find(p => p.id === techId);
      sendNotification(selectedTicketId, 'Técnico Atribuído', `O chamado foi atribuído ao técnico: <strong>${tech?.full_name || 'Nenhum'}</strong>`);
      toast.success('Técnico atribuído com sucesso');
    } catch (error) {
      console.error("Error updating assignment:", error);
      toast.error('Erro ao atribuir técnico');
      // Revert on error
      fetchTickets();
    }
  };

  const handleRequestAccessAgain = async () => {
    if (!currentUser) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: 'PENDING' })
        .eq('id', currentUser.id);
      
      if (error) throw error;
      
      // Audit Log
      await supabase.from('audit_logs').insert([{
        user_id: currentUser.id,
        action: 'USER_RE_REQUESTED_ACCESS',
        new_state: { userId: currentUser.id }
      }]);
      toast.success('Solicitação de acesso enviada com sucesso!');
    } catch (error: any) {
      console.error("Error re-requesting access:", error);
      toast.error("Erro ao solicitar acesso: " + error.message);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-blue-600 mx-auto mb-4" size={48} />
          <p className="text-slate-500 font-medium">Iniciando sistema...</p>
        </div>
      </div>
    );
  }

  if (currentUser && userProfile?.role === 'INACTIVE') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white p-12 rounded-[40px] border border-slate-200 shadow-2xl text-center space-y-8"
        >
          <div className="w-24 h-24 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <UserMinus size={48} />
          </div>
          <div className="space-y-4">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Acesso Bloqueado</h1>
            <p className="text-slate-500 leading-relaxed">
              Olá, <span className="font-bold text-slate-900">{userProfile.full_name}</span>. 
              Sua conta foi desativada por um administrador. Você não tem mais permissão para acessar o sistema.
            </p>
          </div>
          <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
            <p className="text-xs font-bold text-red-600 uppercase tracking-widest">Status da Conta</p>
            <p className="text-sm font-medium text-red-800 mt-1">Conta Inativa</p>
          </div>
          <div className="space-y-3">
            <button 
              onClick={handleRequestAccessAgain}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
            >
              <ShieldCheck size={20} />
              Solicitar Acesso Novamente
            </button>
            <button 
              onClick={() => signOut()}
              className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
            >
              <LogOut size={20} />
              Sair da Conta
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (currentUser && userProfile?.role === 'PENDING') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white p-12 rounded-[40px] border border-slate-200 shadow-2xl text-center space-y-8"
        >
          <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck size={48} />
          </div>
          <div className="space-y-4">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Acesso Pendente</h1>
            <p className="text-slate-500 leading-relaxed">
              Olá, <span className="font-bold text-slate-900">{userProfile.full_name}</span>. 
              Sua conta foi criada, mas ainda precisa ser autorizada por um administrador ou técnico da prefeitura.
            </p>
          </div>
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Status da Solicitação</p>
            <p className="text-sm font-medium text-blue-800 mt-1">Aguardando Aprovação...</p>
          </div>
          <button 
            onClick={() => signOut()}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
          >
            <LogOut size={20} />
            Sair da Conta
          </button>
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">
            Prefeitura Municipal de Guaranésia
          </p>
        </motion.div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-2xl max-w-md w-full text-center">
          <div className="w-20 h-20 bg-blue-600 rounded-[28px] flex items-center justify-center text-white shadow-xl shadow-blue-200 mx-auto mb-8">
            <ShieldCheck size={40} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Service Desk</h1>
          <p className="text-slate-400 font-medium mb-10 uppercase tracking-widest text-xs">Prefeitura de Guaranésia</p>
          
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 py-4 bg-white border-2 border-slate-100 rounded-2xl font-bold text-slate-700 hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
            Entrar com Google
          </button>
          
          <p className="mt-8 text-[10px] text-slate-400 leading-relaxed">
            Acesso restrito a servidores autorizados da Prefeitura Municipal de Guaranésia.
            Ao entrar, você concorda com os termos de uso e auditoria do sistema.
          </p>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Erro de Perfil</h2>
          <p className="text-slate-500 mb-6">
            Não conseguimos carregar ou criar seu perfil de usuário. 
            Isso geralmente acontece devido a permissões de banco de dados (RLS).
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all"
          >
            Tentar Novamente
          </button>
          <button 
            onClick={handleLogout}
            className="w-full mt-3 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-all"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:relative w-64 h-full bg-white border-r border-slate-200 flex flex-col z-50 transition-transform duration-300",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 leading-tight">CPD Guaranésia</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Service Desk</p>
            </div>
          </div>

          <nav className="space-y-1">
            <button 
              onClick={() => {
                navigateTo('dashboard');
                setIsMobileMenuOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left",
                view === 'dashboard' ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50"
              )}
            >
              <LayoutDashboard size={20} />
              Dashboard
            </button>
            <button 
              onClick={() => {
                navigateTo('tickets');
                setIsMobileMenuOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left relative",
                view === 'tickets' || view === 'detail' ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50"
              )}
            >
              <TicketIcon size={20} />
              Chamados
              {stats.open > 0 && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse">
                  {stats.open}
                </span>
              )}
            </button>
            {(userProfile?.role === 'ADMIN' || userProfile?.role === 'TECH') && (
              <>
                <button 
                  onClick={() => {
                    navigateTo('users');
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left relative",
                    view === 'users' ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <Users size={20} />
                  Usuários
                  {pendingUsers.length > 0 && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse">
                      {pendingUsers.length}
                    </span>
                  )}
                </button>
                <button 
                  onClick={() => {
                    navigateTo('techs');
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left",
                    view === 'techs' ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <Wrench size={20} />
                  Técnicos
                </button>
                {userProfile?.role === 'ADMIN' && (
                  <button 
                    onClick={() => {
                      navigateTo('admins');
                      setIsMobileMenuOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left",
                      view === 'admins' ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <ShieldCheck size={20} />
                    Administradores
                  </button>
                )}
                <button 
                  onClick={() => {
                    navigateTo('reports');
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left",
                    view === 'reports' ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <BarChart3 size={20} />
                  Relatórios
                </button>
              </>
            )}
          </nav>
        </div>

        <div className="mt-auto p-6 space-y-4">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <img src={currentUser.user_metadata.avatar_url || ''} alt="" className="w-10 h-10 rounded-full border-2 border-white shadow-sm" />
              <div className="overflow-hidden">
                <p className="text-sm font-semibold truncate">{userProfile?.full_name}</p>
                <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">{userProfile?.role}</p>
              </div>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all text-left"
          >
            <LogOut size={20} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto w-full">
        <header className="h-16 md:h-20 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg"
            >
              <Menu size={24} />
            </button>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-slate-900 truncate">
                {view === 'dashboard' ? 'Visão Geral' : 
                 view === 'tickets' ? 'Gerenciamento de Chamados' : 
                 view === 'techs' ? 'Equipe Técnica' : 
                 view === 'admins' ? 'Administradores do Sistema' :
                 view === 'users' ? 'Usuários do Sistema' :
                 view === 'reports' ? 'Relatórios e Estatísticas' : 
                 'Detalhes do Chamado'}
              </h2>
              <p className="text-xs md:text-sm text-slate-400 hidden sm:block">Prefeitura Municipal de Guaranésia</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar..." 
                className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all w-32 sm:w-64"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value && (view === 'dashboard' || view === 'reports' || view === 'detail')) {
                    navigateTo('tickets');
                  }
                }}
              />
            </div>
            <button 
              onClick={() => {
                if (view === 'techs') setIsNewTechModalOpen(true);
                else setIsNewTicketModalOpen(true);
              }}
              className="hidden md:flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              <Plus size={18} />
              {view === 'techs' ? 'Adicionar Técnico' : 'Novo Chamado'}
            </button>
          </div>
        </header>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {view === 'reports' && (
              <motion.div 
                key="reports"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Taxa de Resolução</p>
                    <h3 className="text-3xl font-black text-slate-900">
                      {stats.total > 0 ? Math.round((stats.finished / stats.total) * 100) : 0}%
                    </h3>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-green-500 transition-all duration-1000" 
                        style={{ width: `${stats.total > 0 ? (stats.finished / stats.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Média de Prioridade</p>
                    <h3 className="text-3xl font-black text-slate-900">
                      {stats.byPriority.find(p => p.name === 'Alta')?.value || 0}
                    </h3>
                    <p className="text-[10px] text-red-500 font-bold mt-1 uppercase">Chamados de Alta Prioridade</p>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Total de Técnicos</p>
                    <h3 className="text-3xl font-black text-slate-900">{techs.length}</h3>
                    <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase">Membros da Equipe</p>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Aguardando</p>
                    <h3 className="text-3xl font-black text-slate-900">
                      {tickets.filter(t => t.status === 'WAITING').length}
                    </h3>
                    <p className="text-[10px] text-purple-600 font-bold mt-1 uppercase">Pendentes de Terceiros</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Priority Chart */}
                  <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
                    <h4 className="font-bold text-slate-900 mb-8 flex items-center gap-2">
                      <AlertTriangle size={20} className="text-orange-500" />
                      Distribuição por Prioridade
                    </h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats.byPriority}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={8}
                            dataKey="value"
                          >
                            {stats.byPriority.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-6 mt-4">
                      {stats.byPriority.map((p) => (
                        <div key={p.name} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tech Performance */}
                  <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
                    <h4 className="font-bold text-slate-900 mb-8 flex items-center gap-2">
                      <Users size={20} className="text-blue-500" />
                      Desempenho da Equipe
                    </h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.techPerformance} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                          <XAxis type="number" hide />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#64748B', fontSize: 11, fontWeight: 600 }}
                            width={100}
                          />
                          <Tooltip 
                            cursor={{ fill: '#F8FAFC' }}
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Bar dataKey="total" fill="#3B82F6" radius={[0, 4, 4, 0]} name="Total Atribuído" />
                          <Bar dataKey="finished" fill="#10B981" radius={[0, 4, 4, 0]} name="Finalizados" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Category Breakdown */}
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
                  <h4 className="font-bold text-slate-900 mb-8">Chamados por Categoria</h4>
                  <div className="grid grid-cols-5 gap-4">
                    {['Hardware', 'Software', 'Rede', 'Telefonia', 'Outros'].map((cat, idx) => {
                      const count = tickets.filter(t => t.category === cat).length;
                      const percentage = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                      const colors = ['bg-blue-500', 'bg-orange-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500'];
                      
                      return (
                        <div key={cat} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{cat}</p>
                          <div className="flex items-end justify-between">
                            <h5 className="text-2xl font-black text-slate-900">{count}</h5>
                            <span className="text-xs font-bold text-slate-400">{percentage}%</span>
                          </div>
                          <div className="w-full h-1 bg-slate-200 rounded-full mt-3 overflow-hidden">
                            <div className={cn("h-full transition-all duration-1000", colors[idx])} style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'users' && (
              <motion.div 
                key="users"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Pending Requests Section */}
                {pendingUsers.length > 0 && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 bg-blue-50 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                        <ShieldCheck size={18} />
                        Solicitações de Acesso Pendentes ({pendingUsers.length})
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Usuário</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Secretaria</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingUsers.map((user) => (
                          <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center font-bold">
                                  {user.full_name[0]}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-900">{user.full_name}</p>
                                  <p className="text-xs text-slate-400">{user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <select 
                                value={user.secretariat || 'Geral'}
                                onChange={(e) => handleUpdateSecretariat(user.id, e.target.value)}
                                className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              >
                                {SECRETARIAS.map(sec => (
                                  <option key={sec} value={sec}>{sec}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button 
                                  onClick={() => handleUpdateRole(user.id, 'USER')}
                                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-100"
                                >
                                  <Check size={14} />
                                  Autorizar
                                </button>
                                <button 
                                  onClick={() => handleRejectUser(user.id)}
                                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-200 transition-all"
                                >
                                  <X size={14} />
                                  Ignorar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-900">Usuários do Sistema</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Usuário</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Secretaria</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center font-bold">
                                {user.full_name[0]}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-900">{user.full_name}</p>
                                <p className="text-xs text-slate-400">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {userProfile?.role === 'ADMIN' ? (
                              <select 
                                value={user.secretariat || 'Geral'}
                                onChange={(e) => handleUpdateSecretariat(user.id, e.target.value)}
                                className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              >
                                {SECRETARIAS.map(sec => (
                                  <option key={sec} value={sec}>{sec}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-sm text-slate-600">{user.secretariat}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {userProfile?.role === 'ADMIN' && (
                              <div className="flex justify-end gap-2">
                                <button 
                                  onClick={() => handleUpdateRole(user.id, 'TECH')}
                                  title="Promover a Técnico"
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all text-[11px] font-bold"
                                >
                                  <Wrench size={14} />
                                  Técnico
                                </button>
                                <button 
                                  onClick={() => handleDeleteUser(user.id)}
                                  title="Excluir Usuário"
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all text-[11px] font-bold"
                                >
                                  <UserMinus size={14} />
                                  Excluir
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {regularUsers.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-slate-400 text-sm">
                            Nenhum usuário cadastrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'techs' && (
              <motion.div 
                key="techs"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Técnico</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Secretaria</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Chamados Ativos</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTechs.map((tech) => (
                        <tr key={tech.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                                {tech.full_name[0]}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-900">{tech.full_name}</p>
                                <p className="text-xs text-slate-400">{tech.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {userProfile?.role === 'ADMIN' ? (
                              <select 
                                value={tech.secretariat || 'Geral'}
                                onChange={(e) => handleUpdateSecretariat(tech.id, e.target.value)}
                                className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              >
                                {SECRETARIAS.map(sec => (
                                  <option key={sec} value={sec}>{sec}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-sm text-slate-600">{tech.secretariat}</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-bold text-blue-600">
                              {tickets.filter(t => t.assigned_to === tech.id && t.status !== 'FINISHED').length}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {userProfile?.role === 'ADMIN' && (
                              <div className="flex justify-end gap-2">
                                <button 
                                  onClick={() => handleUpdateRole(tech.id, 'ADMIN')}
                                  title="Promover a Administrador"
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all text-[11px] font-bold"
                                >
                                  <ShieldCheck size={14} />
                                  Tornar Admin
                                </button>
                                <button 
                                  onClick={() => handleUpdateRole(tech.id, 'USER')}
                                  title="Remover Técnico"
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all text-[11px] font-bold"
                                >
                                  <UserMinus size={14} />
                                  Remover
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {techs.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm">
                            Nenhum técnico cadastrado na equipe.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'admins' && (
              <motion.div 
                key="admins"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Administrador</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Secretaria</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAdmins.map((admin) => (
                        <tr key={admin.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-bold">
                                {admin.full_name[0]}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-900">{admin.full_name}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {userProfile?.role === 'ADMIN' && admin.id !== currentUser.id ? (
                              <select 
                                value={admin.secretariat || 'Geral'}
                                onChange={(e) => handleUpdateSecretariat(admin.id, e.target.value)}
                                className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              >
                                {SECRETARIAS.map(sec => (
                                  <option key={sec} value={sec}>{sec}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-sm text-slate-600">{admin.secretariat}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {userProfile?.role === 'ADMIN' && admin.id !== currentUser.id && (
                              <div className="flex justify-end gap-2">
                                <button 
                                  onClick={() => handleUpdateRole(admin.id, 'TECH')}
                                  title="Rebaixar para Técnico"
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all text-[11px] font-bold"
                                >
                                  <Wrench size={14} />
                                  Técnico
                                </button>
                                <button 
                                  onClick={() => handleUpdateRole(admin.id, 'USER')}
                                  title="Remover Privilégios de Admin"
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all text-[11px] font-bold"
                                >
                                  <ShieldAlert size={14} />
                                  Remover
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                      <TicketIcon size={24} />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">Total de Chamados</p>
                    <h3 className="text-3xl font-bold mt-1">{stats.total}</h3>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center mb-4">
                      <Clock size={24} />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">Em Aberto</p>
                    <h3 className="text-3xl font-bold mt-1 text-orange-600">{stats.open}</h3>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="w-12 h-12 bg-yellow-50 text-yellow-600 rounded-2xl flex items-center justify-center mb-4">
                      <AlertCircle size={24} />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">Em Atendimento</p>
                    <h3 className="text-3xl font-bold mt-1 text-yellow-600">{stats.inProgress}</h3>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-4">
                      <Clock size={24} />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">Aguardando</p>
                    <h3 className="text-3xl font-bold mt-1 text-purple-600">{stats.waiting}</h3>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-4">
                      <CheckCircle2 size={24} />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">Finalizados</p>
                    <h3 className="text-3xl font-bold mt-1 text-green-600">{stats.finished}</h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                      <h4 className="font-bold text-slate-800">Volume de Chamados por Categoria</h4>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.byCategory}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} />
                          <Tooltip 
                            cursor={{ fill: '#F8FAFC' }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                            {stats.byCategory.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={['#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899'][index % 5]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                    <h4 className="font-bold text-slate-800 mb-8">Distribuição de Status</h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Aberto', value: stats.open },
                              { name: 'Em Andamento', value: stats.inProgress },
                              { name: 'Finalizado', value: stats.finished },
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            <Cell fill="#3B82F6" />
                            <Cell fill="#F59E0B" />
                            <Cell fill="#10B981" />
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-3 mt-4">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-blue-500" />
                          <span className="text-slate-500">Abertos</span>
                        </div>
                        <span className="font-bold">{stats.total > 0 ? Math.round((stats.open / stats.total) * 100) : 0}%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-orange-500" />
                          <span className="text-slate-500">Em Andamento</span>
                        </div>
                        <span className="font-bold">{stats.total > 0 ? Math.round((stats.inProgress / stats.total) * 100) : 0}%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                          <span className="text-slate-500">Finalizados</span>
                        </div>
                        <span className="font-bold">{stats.total > 0 ? Math.round((stats.finished / stats.total) * 100) : 0}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'tickets' && (
              <motion.div 
                key="tickets"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 overflow-x-auto">
                  <div className="flex items-center gap-2 min-w-max">
                    <button 
                      onClick={() => setFilterStatus('ALL')}
                      className={cn("px-4 py-2 rounded-xl text-sm font-medium transition-all", filterStatus === 'ALL' ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50")}
                    >
                      Todos
                    </button>
                    <button 
                      onClick={() => setFilterStatus('OPEN')}
                      className={cn("px-4 py-2 rounded-xl text-sm font-medium transition-all", filterStatus === 'OPEN' ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50")}
                    >
                      Abertos
                    </button>
                    <button 
                      onClick={() => setFilterStatus('IN_PROGRESS')}
                      className={cn("px-4 py-2 rounded-xl text-sm font-medium transition-all", filterStatus === 'IN_PROGRESS' ? "bg-yellow-500 text-white" : "text-slate-500 hover:bg-slate-50")}
                    >
                      Em Atendimento
                    </button>
                    <button 
                      onClick={() => setFilterStatus('WAITING')}
                      className={cn("px-4 py-2 rounded-xl text-sm font-medium transition-all", filterStatus === 'WAITING' ? "bg-purple-600 text-white" : "text-slate-500 hover:bg-slate-50")}
                    >
                      Aguardando
                    </button>
                    <button 
                      onClick={() => setFilterStatus('FINISHED')}
                      className={cn("px-4 py-2 rounded-xl text-sm font-medium transition-all", filterStatus === 'FINISHED' ? "bg-green-600 text-white" : "text-slate-500 hover:bg-slate-50")}
                    >
                      Finalizados
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-200">
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Chamado</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Prioridade</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Data</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTickets.map((ticket) => (
                        <tr 
                          key={ticket.id} 
                          className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                          onClick={() => {
                            navigateTo('detail', ticket.id);
                          }}
                        >
                          <td className="px-6 py-5">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">#{ticket.id.slice(-5)} - {ticket.title}</p>
                                {(() => {
                                  const view = ticketViews.find(v => v.ticket_id === ticket.id);
                                  const lastViewed = view ? new Date(view.last_viewed_at) : new Date(0);
                                  const updated = new Date(ticket.updated_at);
                                  
                                  if (updated > lastViewed) {
                                    return <span className="inline-block w-2 h-2 bg-blue-500 rounded-full" title="Novo comentário ou atualização" />;
                                  }
                                  return null;
                                })()}
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5">{ticket.category}</p>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <StatusBadge status={ticket.status} />
                          </td>
                          <td className="px-6 py-5">
                            <PriorityBadge priority={ticket.priority} />
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-sm text-slate-600">{new Date(ticket.created_at).toLocaleDateString('pt-BR')}</p>
                            <p className="text-[10px] text-slate-400">{new Date(ticket.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                          </td>
                          <td className="px-6 py-5 text-right">
                            <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                              <ChevronRight size={20} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {filteredTickets.length === 0 && (
                    <div className="p-20 text-center">
                      <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                        <Search size={40} />
                      </div>
                      <h5 className="font-bold text-slate-800">Nenhum chamado encontrado</h5>
                      <p className="text-slate-400 text-sm mt-1">Tente ajustar seus filtros de busca.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {view === 'detail' && selectedTicket && (
              <motion.div 
                key="detail"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-8"
              >
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                    <button 
                      onClick={() => navigateTo('tickets')}
                      className="flex items-center gap-2 text-slate-400 hover:text-slate-600 text-sm font-medium mb-6 transition-colors"
                    >
                      <ArrowLeft size={16} />
                      Voltar para a lista
                    </button>

                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-2xl font-bold text-slate-900">{selectedTicket.title}</h3>
                          <StatusBadge status={selectedTicket.status} />
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-400">
                          <span className="flex items-center gap-1.5"><Clock size={14} /> Aberto em {new Date(selectedTicket.created_at).toLocaleString('pt-BR')}</span>
                        </div>
                      </div>
                      <PriorityBadge priority={selectedTicket.priority} />
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8">
                      <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Descrição do Problema</h5>
                      <p className="text-slate-700 leading-relaxed">{selectedTicket.description}</p>
                    </div>

                    <div className="space-y-6">
                      <h5 className="font-bold text-slate-800 flex items-center gap-2">
                        <MessageSquare size={18} className="text-blue-600" />
                        Interações e Histórico
                      </h5>

                      <div className="space-y-4">
                        {interactions.map((interaction) => {
                          const isSystemLog = interaction.content.startsWith('SYSTEM_LOG:');
                          const displayContent = isSystemLog ? interaction.content.replace('SYSTEM_LOG:', '') : interaction.content;

                          if (isSystemLog) {
                            return (
                              <div key={interaction.id} className="flex justify-center my-6">
                                <div className="bg-slate-50 px-6 py-2.5 rounded-full border border-slate-200 shadow-sm flex items-center gap-3">
                                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                                    {displayContent} 
                                    <span className="text-slate-300">•</span>
                                    <span className="text-slate-400 font-medium lowercase">
                                      {new Date(interaction.created_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                                    </span>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-blue-600/70 font-bold">
                                      {allProfiles.find(p => p.id === interaction.user_id)?.full_name.split(' ')[0] || 'Sistema'}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={interaction.id} className={cn(
                              "flex gap-4",
                              interaction.user_id === currentUser.id ? "flex-row-reverse" : ""
                            )}>
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                {interaction.user_id === currentUser.id ? 'EU' : 'CPD'}
                              </div>
                              <div className={cn(
                                "max-w-[80%] p-4 rounded-2xl text-sm",
                                interaction.user_id === currentUser.id 
                                  ? "bg-blue-600 text-white rounded-tr-none" 
                                  : "bg-slate-100 text-slate-700 rounded-tl-none"
                              )}>
                                <p>{displayContent}</p>
                                <div className="flex justify-between items-center mt-2 gap-2">
                                  <p className={cn(
                                    "text-[9px] font-bold uppercase tracking-wider",
                                    interaction.user_id === currentUser.id ? "text-blue-200" : "text-slate-400"
                                  )}>
                                    {allProfiles.find(p => p.id === interaction.user_id)?.full_name || 'Usuário'}
                                  </p>
                                  <p className={cn(
                                    "text-[10px]",
                                    interaction.user_id === currentUser.id ? "text-blue-200" : "text-slate-400"
                                  )}>{new Date(interaction.created_at).toLocaleString('pt-BR')}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="pt-6 border-t border-slate-100">
                        <div className="relative">
                          <textarea 
                            placeholder="Digite sua mensagem..."
                            className="w-full p-4 pr-16 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none h-24"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                const val = e.currentTarget.value;
                                if (val.trim()) {
                                  handleSendMessage(val);
                                  e.currentTarget.value = '';
                                }
                              }
                            }}
                          />
                          <button 
                            onClick={(e) => {
                              const textarea = e.currentTarget.previousElementSibling as HTMLTextAreaElement;
                              if (textarea.value.trim()) {
                                handleSendMessage(textarea.value);
                                textarea.value = '';
                              }
                            }}
                            className="absolute right-4 bottom-4 p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-md"
                          >
                            <Send size={18} />
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 text-center italic">Pressione Enter para enviar</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <h5 className="font-bold text-slate-800 mb-6">Informações do Chamado</h5>
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Criado por</p>
                        <p className="text-sm font-semibold text-slate-700">{allProfiles.find(p => p.id === selectedTicket.created_by)?.full_name || 'Usuário Desconhecido'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Secretaria</p>
                        <p className="text-sm font-semibold text-slate-700">{selectedTicket.secretariat}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Categoria</p>
                        <p className="text-sm font-semibold text-slate-700">{selectedTicket.category}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Técnico Responsável</p>
                        {userProfile?.role === 'ADMIN' ? (
                          <select 
                            value={selectedTicket.assigned_to || ''}
                            onChange={(e) => handleUpdateAssignment(e.target.value)}
                            className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
                          >
                            <option value="">Não atribuído</option>
                            {techs.map(tech => (
                              <option key={tech.id} value={tech.id}>{tech.full_name}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex items-center gap-2 mt-1 p-2 bg-slate-50 border border-slate-100 rounded-xl">
                            {selectedTicket.assigned_to ? (
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-[10px] font-bold">
                                  {allProfiles.find(p => p.id === selectedTicket.assigned_to)?.full_name?.[0] || 'T'}
                                </div>
                                <span className="text-sm font-medium text-slate-700">
                                  {allProfiles.find(p => p.id === selectedTicket.assigned_to)?.full_name || 'Técnico Atribuído'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm font-medium text-slate-400 italic">Aguardando Técnico</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</p>
                        {(userProfile?.role === 'ADMIN' || (userProfile?.role === 'TECH' && selectedTicket.assigned_to === currentUser.id)) ? (
                          <select 
                            value={selectedTicket.status}
                            onChange={(e) => handleUpdateStatus(e.target.value as TicketStatus)}
                            disabled={userProfile.role === 'TECH' && selectedTicket.status === 'FINISHED'}
                            className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none disabled:opacity-50"
                          >
                            <option value="OPEN">Aberto</option>
                            <option value="IN_PROGRESS">Em Andamento</option>
                            <option value="WAITING">Aguardando</option>
                            <option value="FINISHED">Finalizado</option>
                          </select>
                        ) : (
                          <div className="mt-1">
                            <StatusBadge status={selectedTicket.status} />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Última Atualização</p>
                        <p className="text-sm font-medium text-slate-700">{new Date(selectedTicket.updated_at).toLocaleString('pt-BR')}</p>
                      </div>
                    </div>
                  </div>

                  {selectedTicket.ai_suggestion && (
                    <div className="bg-blue-600 p-6 rounded-3xl text-white shadow-lg shadow-blue-200">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                          <ShieldCheck size={20} />
                        </div>
                        <h5 className="font-bold">Sugestão da IA</h5>
                      </div>
                      <p className="text-sm text-blue-50 leading-relaxed">
                        {selectedTicket.ai_suggestion}
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile FAB */}
        <button
          onClick={() => {
            if (view === 'techs') setIsNewTechModalOpen(true);
            else setIsNewTicketModalOpen(true);
          }}
          className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-600/30 flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all z-50"
        >
          <Plus size={24} />
        </button>
      </main>

      {/* New Tech Modal */}
      <AnimatePresence>
        {isNewTechModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNewTechModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-xl rounded-[32px] shadow-2xl overflow-hidden border border-slate-200"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Adicionar Técnico</h2>
                    <p className="text-sm text-slate-400">Promova um servidor para a equipe técnica</p>
                  </div>
                  <button 
                    onClick={() => setIsNewTechModalOpen(false)}
                    className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center hover:bg-slate-100 transition-all"
                  >
                    <Plus size={24} className="rotate-45 text-slate-400" />
                  </button>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {allProfiles
                    .filter(p => p.role === 'USER')
                    .map(profile => (
                      <div key={profile.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center font-bold text-slate-400 border border-slate-200 text-sm">
                            {profile.full_name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{profile.full_name}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{profile.secretariat}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            handleUpdateRole(profile.id, 'TECH');
                            setIsNewTechModalOpen(false);
                          }}
                          className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                        >
                          Promover
                        </button>
                      </div>
                    ))}
                  {allProfiles.filter(p => p.role === 'USER').length === 0 && (
                    <div className="text-center py-12">
                      <Users className="mx-auto text-slate-200 mb-4" size={48} />
                      <p className="text-slate-400 text-sm">Nenhum usuário disponível para promoção.</p>
                      <p className="text-[10px] text-slate-300 mt-1 uppercase tracking-widest">Apenas usuários com cargo 'USER' podem ser promovidos</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Ticket Modal */}
      <AnimatePresence>
        {isNewTicketModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNewTicketModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">Abrir Novo Chamado</h3>
                    <p className="text-sm text-slate-400">Descreva o problema detalhadamente</p>
                  </div>
                  <button 
                    onClick={() => setIsNewTicketModalOpen(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <Plus size={24} className="rotate-45 text-slate-400" />
                  </button>
                </div>

                <form onSubmit={handleCreateTicket} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Título do Chamado</label>
                    <input 
                      name="title"
                      required
                      type="text" 
                      placeholder="Ex: Monitor piscando na recepção" 
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Categoria</label>
                      <select name="category" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all">
                        <option>Hardware</option>
                        <option>Software</option>
                        <option>Rede</option>
                        <option>Telefonia</option>
                        <option>Outros</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Prioridade</label>
                      <select name="priority" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all">
                        <option value="LOW">Baixa</option>
                        <option value="MEDIUM">Média</option>
                        <option value="HIGH">Alta</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Descrição Completa</label>
                    <textarea 
                      name="description"
                      required
                      placeholder="Descreva o que está acontecendo..." 
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none h-32"
                    />
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button"
                      disabled={isAnalyzing}
                      onClick={() => setIsNewTicketModalOpen(false)}
                      className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-all disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={isAnalyzing}
                      className="flex-[2] py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          Analisando com IA...
                        </>
                      ) : 'Criar Chamado'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" richColors />
      <HelpDeskApp />
    </ErrorBoundary>
  );
}
