import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, MessageCircle, Send, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../app/auth';
import { EmptyState, SetupNotice } from '../../components/ui/Callout';
import { formatDate, formatXof } from '../../lib/utils';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

interface Conversation {
  conversation_id: string;
  conversations: { id: string; title: string | null; updated_at: string; product_id: string | null; order_id: string | null } | null;
}
interface Message { id: string; conversation_id: string; sender_id: string; body: string; created_at: string }
interface Offer { id: string; conversation_id: string; offered_by: string; amount_xof: number; note: string | null; status: string; created_at: string }

export function ChatPanel() {
  const { user, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const requested = params.get('conversation');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [body, setBody] = useState('');
  const [offerAmount, setOfferAmount] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [sending, setSending] = useState(false);
  const [conversationError, setConversationError] = useState('');
  const [messageError, setMessageError] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');
  const [realtimeAttempt, setRealtimeAttempt] = useState(0);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [olderMessageError, setOlderMessageError] = useState('');
  const messageRequestId = useRef(0);

  const loadConversations = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('conversation_participants')
        .select('conversation_id, conversations(id,title,updated_at,product_id,order_id)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setConversationError('');
      const list = (data as unknown as Conversation[] | null) ?? [];
      setConversations(list);
      setSelected((current) => {
        if (requested && list.some((item) => item.conversation_id === requested)) return requested;
        return list.some((item) => item.conversation_id === current) ? current : list[0]?.conversation_id ?? '';
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'erreur réseau inattendue';
      setConversationError(message);
      toast.error(`Impossible de charger les conversations : ${message}`);
      setConversations([]);
      setSelected('');
    } finally {
      setLoading(false);
    }
  }, [requested, user]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!supabase || !conversationId) return;
    const requestId = ++messageRequestId.current;
    const conversation = conversations.find((item) => item.conversation_id === conversationId)?.conversations;
    const isServiceConversation = conversation?.title?.startsWith('Devis service #') ?? false;
    try {
      const [messageResult, offerResult] = await Promise.all([
        supabase.from('messages').select('id,conversation_id,sender_id,body,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(200),
        isServiceConversation
          ? Promise.resolve({ data: [] as Offer[], error: null })
        : supabase.from('price_offers').select('id,conversation_id,offered_by,amount_xof,note,status,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(20),
      ]);
      if (requestId !== messageRequestId.current) return;
      const errors: string[] = [];
      if (messageResult.error) errors.push(`Messages : ${messageResult.error.message}`);
      if (offerResult.error) errors.push(`Propositions de prix : ${offerResult.error.message}`);
      setMessageError(errors.join(' · '));
      const latestMessages = messageResult.error ? [] : ((messageResult.data as Message[] | null) ?? []).reverse();
      setMessages((current) => {
        const merged = new Map([...current, ...latestMessages].map((message) => [message.id, message]));
        return [...merged.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      });
      if (!messageResult.error && (messageResult.data?.length ?? 0) === 200) setHasOlderMessages(true);
      setOffers(offerResult.error ? [] : (offerResult.data as Offer[] | null) ?? []);
      if (errors.length) toast.error(`Chargement de la discussion incomplet : ${errors.join(' · ')}`);
    } catch (reason) {
      if (requestId !== messageRequestId.current) return;
      const message = reason instanceof Error ? reason.message : 'erreur réseau inattendue';
      setMessageError(message);
      setMessages([]);
      setOffers([]);
      toast.error(`Discussion non chargée : ${message}`);
    }
  }, [conversations]);

  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => {
    if (!selected) { setRealtimeStatus('idle'); return; }
    if (!supabase) { setRealtimeStatus('disconnected'); return; }
    setRealtimeStatus('connecting');
    setMessages([]);
    setOffers([]);
    setHasOlderMessages(false);
    setOlderMessageError('');
    setMessageError('');
    void loadMessages(selected);
    const channel = supabase.channel(`chat-${selected}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selected}` }, () => void loadMessages(selected))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'price_offers', filter: `conversation_id=eq.${selected}` }, () => void loadMessages(selected))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtimeStatus('disconnected');
      });
    return () => { messageRequestId.current += 1; void supabase?.removeChannel(channel); };
  }, [selected, loadMessages, realtimeAttempt]);

  async function loadOlderMessages() {
    if (!supabase || !selected || !hasOlderMessages || loadingOlderMessages || !messages.length) return;
    const conversationId = selected;
    const requestId = messageRequestId.current;
    const oldest = messages[0];
    setLoadingOlderMessages(true);
    setOlderMessageError('');
    try {
      const { data, error } = await supabase.from('messages')
        .select('id,conversation_id,sender_id,body,created_at')
        .eq('conversation_id', conversationId)
        .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(200);
      if (error) throw error;
      if (requestId !== messageRequestId.current) return;
      const older = ((data as Message[] | null) ?? []).reverse();
      setMessages((current) => {
        const merged = new Map([...older, ...current].map((message) => [message.id, message]));
        return [...merged.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      });
      setHasOlderMessages(older.length === 200);
    } catch (reason) {
      if (requestId === messageRequestId.current) setOlderMessageError(reason instanceof Error ? reason.message : 'erreur réseau inattendue');
    } finally {
      setLoadingOlderMessages(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const trimmedBody = body.trim();
    if (!supabase || !user || !selected) return;
    if (!trimmedBody) { toast.error('Écrivez un message avant de l’envoyer.'); return; }
    if (trimmedBody.length > 3000) { toast.error('Un message ne peut pas dépasser 3 000 caractères.'); return; }
    setSending(true);
    try {
      const { error } = await supabase.from('messages').insert({ conversation_id: selected, sender_id: user.id, body: trimmedBody });
      if (error) toast.error(`Message non envoyé : ${error.message}`);
      else { setBody(''); await loadMessages(selected); }
    } catch (reason) {
      toast.error(`Message non envoyé : ${reason instanceof Error ? reason.message : 'erreur réseau inattendue'}`);
    } finally {
      setSending(false);
    }
  }

  async function sendOffer() {
    if (!supabase || !user || !selected) return;
    const amount = Number(offerAmount);
    if (!Number.isFinite(amount) || amount < 1) { toast.error('Indiquez un prix supérieur à zéro.'); return; }
    const conversation = conversations.find((item) => item.conversation_id === selected)?.conversations;
    if (!conversation?.product_id || conversation.title?.startsWith('Devis service #')) { toast.error('Cette conversation n’est pas rattachée à un produit négociable.'); return; }
    try {
      const { error } = await supabase.from('price_offers').insert({ conversation_id: selected, product_id: conversation.product_id, offered_by: user.id, amount_xof: Math.round(amount), status: 'pending' });
      if (error) toast.error(`Proposition non enregistrée : ${error.message}`);
      else { setOfferAmount(''); toast.success('Proposition enregistrée.'); await loadMessages(selected); }
    } catch (reason) {
      toast.error(`Proposition non enregistrée : ${reason instanceof Error ? reason.message : 'erreur réseau inattendue'}`);
    }
  }

  async function respond(offerId: string, accept: boolean) {
    if (!supabase) return;
    try {
      const { error } = await supabase.rpc('respond_to_price_offer', { p_offer_id: offerId, p_accept: accept });
      if (error) toast.error(`Décision non enregistrée : ${error.message}`);
      else { toast.success(accept ? 'Offre acceptée. Le paiement n’est pas confirmé.' : 'Offre refusée.'); if (selected) await loadMessages(selected); }
    } catch (reason) {
      toast.error(`Décision non enregistrée : ${reason instanceof Error ? reason.message : 'erreur réseau inattendue'}`);
    }
  }

  if (!isSupabaseConfigured) return <section><h2 className="font-display text-2xl font-extrabold">Messages</h2><div className="mt-5"><SetupNotice /></div></section>;
  return (
    <section>
      <div className="mb-5"><p className="eyebrow">Échanges sécurisés</p><div className="mt-1 flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-2xl font-extrabold">Messages & négociation</h2><div className="flex flex-wrap items-center gap-2"><span role="status" className={`rounded-full px-3 py-1 text-xs font-bold ${realtimeStatus === 'connected' ? 'bg-emerald-50 text-emerald-800' : realtimeStatus === 'connecting' ? 'bg-amber-50 text-amber-800' : realtimeStatus === 'disconnected' ? 'bg-red-50 text-red-800' : 'bg-faso-ivory text-faso-muted'}`}>{realtimeStatus === 'connected' ? 'Messagerie en direct' : realtimeStatus === 'connecting' ? 'Connexion en cours…' : realtimeStatus === 'disconnected' ? 'Temps réel indisponible' : loading ? 'Chargement des conversations…' : conversationError ? 'État non vérifiable' : conversations.length ? 'Choisissez une discussion' : 'Aucune discussion'}</span>{selected && realtimeStatus === 'disconnected' && <button type="button" onClick={() => setRealtimeAttempt((attempt) => attempt + 1)} className="min-h-9 rounded-full border border-faso-line bg-white px-3 text-xs font-bold text-faso-forest hover:bg-faso-ivory">Réessayer le direct</button>}</div></div><p className="mt-2 text-sm text-faso-muted">Une offre acceptée confirme le prix proposé, pas le paiement ni la livraison. Le statut en direct ne s’applique qu’à la discussion sélectionnée.</p></div>
      <div className="grid min-h-[520px] overflow-hidden rounded-3xl border border-faso-line bg-white md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="max-h-64 overflow-y-auto border-b border-faso-line bg-faso-ivory/60 p-3 md:max-h-none md:border-b-0 md:border-r">
          <p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-faso-muted">Conversations</p>
          {loading ? <p className="p-3 text-sm text-faso-muted">Chargement…</p> : conversationError ? <div className="px-3 py-2 text-sm text-red-800"><p role="alert">Conversations indisponibles : {conversationError}</p><button type="button" className="mt-2 min-h-11 font-bold underline" onClick={() => void loadConversations()}>Réessayer</button></div> : conversations.length ? <div className="grid gap-1">{conversations.map((item) => <button type="button" key={item.conversation_id} onClick={() => { setSelected(item.conversation_id); const next = new URLSearchParams(params); next.set('conversation', item.conversation_id); setParams(next, { replace: true }); }} aria-current={selected === item.conversation_id ? 'true' : undefined} className={`min-h-11 rounded-xl p-3 text-left text-sm transition ${selected === item.conversation_id ? 'bg-faso-forest text-white' : 'hover:bg-white'}`}><span className="block truncate font-bold">{item.conversations?.title || (item.conversations?.order_id ? 'Commande' : 'Conversation')}</span><span className={`mt-1 block text-xs ${selected === item.conversation_id ? 'text-white/70' : 'text-faso-muted'}`}>{item.conversations?.updated_at ? formatDate(item.conversations.updated_at) : 'Nouvelle conversation'}</span></button>)}</div> : profile?.role === 'service_provider' ? <p className="px-3 py-2 text-sm leading-6 text-faso-muted">Aucune discussion pour le moment. Les échanges liés aux demandes de prestations apparaîtront ici. <Link className="font-bold text-faso-forest underline" to="/provider/requests">Consulter mes demandes</Link>.</p> : <p className="px-3 py-2 text-sm leading-6 text-faso-muted">Aucune conversation. Ouvrez une fiche produit pour contacter sa boutique.</p>}
        </aside>
        <div className="flex min-h-[420px] flex-col">
          {selected ? <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              {messageError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Discussion chargée partiellement : {messageError} <button className="font-bold underline" onClick={() => void loadMessages(selected)}>Réessayer</button></p>}
              {hasOlderMessages && <div className="text-center"><button type="button" className="btn-secondary !min-h-9 !px-3 !py-2" disabled={loadingOlderMessages} onClick={() => void loadOlderMessages()}>{loadingOlderMessages ? 'Chargement…' : 'Charger les messages précédents'}</button>{olderMessageError && <p role="alert" className="mt-2 text-sm text-red-800">Messages précédents indisponibles : {olderMessageError}</p>}</div>}
              {messages.length ? messages.map((message) => <div key={message.id} className={`flex ${message.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${message.sender_id === user?.id ? 'rounded-br-md bg-faso-forest text-white' : 'rounded-bl-md bg-faso-ivory text-faso-ink'}`}><p className="whitespace-pre-wrap">{message.body}</p><p className={`mt-2 text-[10px] ${message.sender_id === user?.id ? 'text-white/60' : 'text-faso-muted'}`}>{formatDate(message.created_at, { hour: '2-digit', minute: '2-digit' })}</p></div></div>) : !messageError && <p className="py-8 text-center text-sm text-faso-muted">Démarrez la conversation.</p>}
              {offers.map((offer) => <div key={offer.id} className="rounded-2xl border border-faso-saffron/40 bg-[#FFF8E8] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[#8A6200]">Proposition de prix</p><p className="mt-1 font-display text-xl font-extrabold">{formatXof(offer.amount_xof)}</p><p className="mt-1 text-xs text-faso-muted">{offer.status === 'pending' ? 'En attente de réponse' : offer.status === 'accepted' ? 'Acceptée — paiement non confirmé' : 'Refusée'}</p></div>{offer.status === 'pending' && offer.offered_by !== user?.id && <div className="flex gap-2"><button className="btn-secondary !min-h-9 !px-3 !py-2" onClick={() => void respond(offer.id, false)}><X className="h-4 w-4" />Refuser</button><button className="btn-primary !min-h-9 !px-3 !py-2" onClick={() => void respond(offer.id, true)}><Check className="h-4 w-4" />Accepter</button></div>}</div></div>)}
            </div>
            <div className="border-t border-faso-line p-3 sm:p-4"><form onSubmit={sendMessage} className="flex items-end gap-2"><textarea value={body} onChange={(e) => setBody(e.target.value)} className="field min-h-11 resize-y" rows={1} maxLength={3000} placeholder="Écrire un message…" aria-label="Message" /><button className="btn-primary !h-11 !w-11 !min-h-11 !p-0" disabled={sending || !body.trim() || body.trim().length > 3000} aria-label="Envoyer le message"><Send className="h-4 w-4" /></button></form>{!conversations.find((item) => item.conversation_id === selected)?.conversations?.title?.startsWith('Devis service #') && <div className="mt-3 flex gap-2"><input className="field !max-w-40 !py-2" type="number" min="1" step="1" value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)} placeholder="Prix en FCFA" aria-label="Prix proposé" /><button className="btn-secondary !min-h-9 !px-3 !py-2 text-xs" onClick={() => void sendOffer()}><ArrowUpRight className="h-4 w-4" />Proposer un prix</button></div>}{conversations.find((item) => item.conversation_id === selected)?.conversations?.title?.startsWith('Devis service #') && <p className="mt-2 text-xs text-faso-muted">Pour ce service, répondez au devis depuis les demandes reçues ou échangez les conditions par message.</p>}</div>
          </> : <div className="grid flex-1 place-items-center p-6"><EmptyState title="Choisissez une conversation"><MessageCircle className="h-5 w-5" /></EmptyState></div>}
        </div>
      </div>
    </section>
  );
}
