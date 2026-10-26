import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, MessageCircle, Send, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
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
  const { user } = useAuth();
  const [params] = useSearchParams();
  const requested = params.get('conversation');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [body, setBody] = useState('');
  const [offerAmount, setOfferAmount] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [sending, setSending] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!supabase || !user) return;
    const { data, error } = await supabase
      .from('conversation_participants')
      .select('conversation_id, conversations(id,title,updated_at,product_id,order_id)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) toast.error('Impossible de charger les conversations.');
    const list = (data as unknown as Conversation[] | null) ?? [];
    setConversations(list);
    const initial = requested && list.some((item) => item.conversation_id === requested)
      ? requested : list[0]?.conversation_id ?? '';
    setSelected((current) => current || initial);
    setLoading(false);
  }, [requested, user]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!supabase || !conversationId) return;
    const [messageResult, offerResult] = await Promise.all([
      supabase.from('messages').select('id,conversation_id,sender_id,body,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(200),
      supabase.from('price_offers').select('id,conversation_id,offered_by,amount_xof,note,status,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(20),
    ]);
    setMessages((messageResult.data as Message[] | null) ?? []);
    setOffers((offerResult.data as Offer[] | null) ?? []);
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => {
    if (!selected || !supabase) return;
    void loadMessages(selected);
    const channel = supabase.channel(`chat-${selected}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selected}` }, () => void loadMessages(selected))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'price_offers', filter: `conversation_id=eq.${selected}` }, () => void loadMessages(selected))
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [selected, loadMessages]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !user || !selected || !body.trim()) return;
    setSending(true);
    const { error } = await supabase.from('messages').insert({ conversation_id: selected, sender_id: user.id, body: body.trim() });
    setSending(false);
    if (error) toast.error('Message non envoyé. Vérifiez l’accès à la conversation.');
    else { setBody(''); await loadMessages(selected); }
  }

  async function sendOffer() {
    if (!supabase || !user || !selected) return;
    const amount = Number(offerAmount);
    if (!Number.isFinite(amount) || amount < 1) { toast.error('Indiquez un prix supérieur à zéro.'); return; }
    const conversation = conversations.find((item) => item.conversation_id === selected)?.conversations;
    if (!conversation?.product_id) { toast.error('Cette conversation n’est pas rattachée à un produit négociable.'); return; }
    const { error } = await supabase.from('price_offers').insert({ conversation_id: selected, product_id: conversation.product_id, offered_by: user.id, amount_xof: Math.round(amount), status: 'pending' });
    if (error) toast.error('La proposition n’a pas pu être enregistrée.');
    else { setOfferAmount(''); toast.success('Proposition enregistrée.'); await loadMessages(selected); }
  }

  async function respond(offerId: string, accept: boolean) {
    if (!supabase) return;
    const { error } = await supabase.rpc('respond_to_price_offer', { p_offer_id: offerId, p_accept: accept });
    if (error) toast.error('Décision non enregistrée.');
    else { toast.success(accept ? 'Offre acceptée. Le paiement n’est pas confirmé.' : 'Offre refusée.'); if (selected) await loadMessages(selected); }
  }

  if (!isSupabaseConfigured) return <section><h2 className="font-display text-2xl font-extrabold">Messages</h2><div className="mt-5"><SetupNotice /></div></section>;
  return (
    <section>
      <div className="mb-5"><p className="eyebrow">Échanges sécurisés</p><h2 className="mt-1 font-display text-2xl font-extrabold">Messages & négociation</h2><p className="mt-2 text-sm text-faso-muted">Une offre acceptée confirme le prix proposé, pas le paiement ni la livraison.</p></div>
      <div className="grid min-h-[520px] overflow-hidden rounded-3xl border border-faso-line bg-white md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-faso-line bg-faso-ivory/60 p-3 md:border-b-0 md:border-r">
          <p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-faso-muted">Conversations</p>
          {loading ? <p className="p-3 text-sm text-faso-muted">Chargement…</p> : conversations.length ? <div className="grid gap-1">{conversations.map((item) => <button key={item.conversation_id} onClick={() => setSelected(item.conversation_id)} className={`rounded-xl p-3 text-left text-sm transition ${selected === item.conversation_id ? 'bg-faso-forest text-white' : 'hover:bg-white'}`}><span className="block truncate font-bold">{item.conversations?.title || (item.conversations?.order_id ? 'Commande' : 'Conversation')}</span><span className={`mt-1 block text-xs ${selected === item.conversation_id ? 'text-white/70' : 'text-faso-muted'}`}>{item.conversations?.updated_at ? formatDate(item.conversations.updated_at) : 'Nouvelle conversation'}</span></button>)}</div> : <p className="px-3 py-2 text-sm leading-6 text-faso-muted">Aucune conversation. Ouvrez une fiche produit pour contacter sa boutique.</p>}
        </aside>
        <div className="flex min-h-[420px] flex-col">
          {selected ? <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              {messages.length ? messages.map((message) => <div key={message.id} className={`flex ${message.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${message.sender_id === user?.id ? 'rounded-br-md bg-faso-forest text-white' : 'rounded-bl-md bg-faso-ivory text-faso-ink'}`}><p className="whitespace-pre-wrap">{message.body}</p><p className={`mt-2 text-[10px] ${message.sender_id === user?.id ? 'text-white/60' : 'text-faso-muted'}`}>{formatDate(message.created_at, { hour: '2-digit', minute: '2-digit' })}</p></div></div>) : <p className="py-8 text-center text-sm text-faso-muted">Démarrez la conversation.</p>}
              {offers.map((offer) => <div key={offer.id} className="rounded-2xl border border-faso-saffron/40 bg-[#FFF8E8] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[#8A6200]">Proposition de prix</p><p className="mt-1 font-display text-xl font-extrabold">{formatXof(offer.amount_xof)}</p><p className="mt-1 text-xs text-faso-muted">{offer.status === 'pending' ? 'En attente de réponse' : offer.status === 'accepted' ? 'Acceptée — paiement non confirmé' : 'Refusée'}</p></div>{offer.status === 'pending' && offer.offered_by !== user?.id && <div className="flex gap-2"><button className="btn-secondary !min-h-9 !px-3 !py-2" onClick={() => void respond(offer.id, false)}><X className="h-4 w-4" />Refuser</button><button className="btn-primary !min-h-9 !px-3 !py-2" onClick={() => void respond(offer.id, true)}><Check className="h-4 w-4" />Accepter</button></div>}</div></div>)}
            </div>
            <div className="border-t border-faso-line p-3 sm:p-4"><form onSubmit={sendMessage} className="flex items-end gap-2"><textarea value={body} onChange={(e) => setBody(e.target.value)} className="field min-h-11 resize-y" rows={1} maxLength={3000} placeholder="Écrire un message…" aria-label="Message" /><button className="btn-primary !h-11 !w-11 !min-h-11 !p-0" disabled={sending || !body.trim()} aria-label="Envoyer le message"><Send className="h-4 w-4" /></button></form><div className="mt-3 flex gap-2"><input className="field !max-w-40 !py-2" type="number" min="1" step="1" value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)} placeholder="Prix en FCFA" aria-label="Prix proposé" /><button className="btn-secondary !min-h-9 !px-3 !py-2 text-xs" onClick={() => void sendOffer()}><ArrowUpRight className="h-4 w-4" />Proposer un prix</button></div></div>
          </> : <div className="grid flex-1 place-items-center p-6"><EmptyState title="Choisissez une conversation"><MessageCircle className="h-5 w-5" /></EmptyState></div>}
        </div>
      </div>
    </section>
  );
}
