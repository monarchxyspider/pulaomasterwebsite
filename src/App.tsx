import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bike,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CookingPot,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  Heart,
  LoaderCircle,
  MapPin,
  Menu as MenuIcon,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Soup,
  Sparkles,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  get,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
} from "firebase/database";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { auth, database, restaurantContact } from "./lib/firebase";
import {
  cleanPhone,
  defaultDishes,
  defaultSettings,
  formatPrice,
  isApprovedAdminEmail,
  isValidPakistaniPhone,
  normalizeDish,
  orderStatuses,
  type Dish,
  type OrderLine,
  type OrderRecord,
  type OrderStatus,
  type PublicSettings,
} from "./lib/restaurant";

type ToastItem = { id: number; message: string; tone: "success" | "error" | "info" };
type OrderConfirmation = { orderId: string; total: number; whatsappUrl: string };
type TrackRecord = { orderId: string; status: OrderStatus; itemsSummary: string; total: number; createdAt: number; updatedAt: number };

type OwnerNotice = { title: string; message: string; email?: string };

const appDefaultSettings: PublicSettings = {
  ...defaultSettings,
  contactNumber: restaurantContact.phone,
  whatsappNumber: restaurantContact.whatsapp,
};

function formatDate(timestamp: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "Date not available";
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

function authCode(reason: unknown): string {
  if (reason && typeof reason === "object" && "code" in reason) return String((reason as { code: unknown }).code);
  return "";
}

function describeAuthError(code: string): string {
  switch (code) {
    case "auth/unauthorized-domain":
      return "This website domain is not allowed for Google sign-in. In Firebase Console open Authentication > Settings > Authorized domains and add this domain.";
    case "auth/operation-not-allowed":
      return "Google sign-in is not enabled. In Firebase Console open Authentication > Sign-in method, enable Google and save.";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      return "The Firebase web API key was rejected. In Google Cloud Console > APIs & Services > Credentials, check the browser key's website restrictions and allow Identity Toolkit API.";
    case "auth/network-request-failed":
      return "Network problem. Check your internet connection and try again.";
    case "auth/too-many-requests":
      return "Too many sign-in attempts. Wait a few minutes and try again.";
    case "auth/user-disabled":
      return "This Google account has been disabled.";
    default:
      return `Google sign-in did not complete${code ? ` (${code})` : ""}. Please try again.`;
  }
}

function normalizeOrder(key: string, value: Record<string, unknown>): OrderRecord {
  const customer = value.customer && typeof value.customer === "object"
    ? value.customer as Record<string, unknown>
    : {};
  const rawItems = Array.isArray(value.items) ? value.items : [];
  const items: OrderLine[] = rawItems.map((item, index) => {
    const line = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: typeof line.id === "string" ? line.id : `line-${index}`,
      name: typeof line.name === "string" ? line.name : "Menu item",
      price: Math.max(0, Number(line.price) || 0),
      qty: Math.max(0, Number(line.qty) || 0),
    };
  });
  const createdAt = Number(value.createdAt) || Date.now();
  const status = orderStatuses.includes(value.status as OrderStatus) ? value.status as OrderStatus : "Pending";
  const subtotal = Number(value.subtotal) || Number(value.total) || items.reduce((sum, item) => sum + item.price * item.qty, 0);

  return {
    id: typeof value.id === "string" ? value.id : key,
    databaseKey: key,
    customer: {
      name: typeof customer.name === "string" ? customer.name : "Customer",
      phone: typeof customer.phone === "string" ? customer.phone : "",
      address: typeof customer.address === "string" ? customer.address : "",
    },
    items,
    subtotal,
    deliveryFee: Math.max(0, Number(value.deliveryFee) || 0),
    deliveryFeeConfigured: value.deliveryFeeConfigured === true,
    total: Number(value.total) || subtotal,
    status,
    createdAt,
    updatedAt: Number(value.updatedAt) || undefined,
    deliveryInstructions: typeof value.deliveryInstructions === "string" ? value.deliveryInstructions : "",
  };
}

function normalizeTrack(orderId: string, value: Record<string, unknown>): TrackRecord {
  const status = orderStatuses.includes(value.status as OrderStatus) ? value.status as OrderStatus : "Pending";
  return {
    orderId,
    status,
    itemsSummary: typeof value.itemsSummary === "string" ? value.itemsSummary : "",
    total: Number(value.total) || 0,
    createdAt: Number(value.createdAt) || 0,
    updatedAt: Number(value.updatedAt) || Number(value.createdAt) || 0,
  };
}

function BrandMark({ inverted = false, compact = false, restaurantName = "Pulao Master" }: { inverted?: boolean; compact?: boolean; restaurantName?: string }) {
  const [first, ...rest] = restaurantName.trim().split(/\s+/);
  return (
    <a className={`brand-lockup${inverted ? " brand-lockup-inverted" : ""}${compact ? " brand-lockup-compact" : ""}`} href="#home" aria-label={`${restaurantName} home`}>
      <span className="brand-emblem" aria-hidden="true">
        <img src="/images/pulaomaster-logo.jpg" alt="" width={42} height={42} decoding="async" />
      </span>
      <span className="brand-wordmark"><strong>{first || "Pulao"}</strong><span>{rest.join(" ") || "Master"}</span></span>
    </a>
  );
}

function AnimatedAmount({ amount, className = "" }: { amount: number; className?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.strong
        key={amount}
        className={className}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15 }}
      >
        {formatPrice(amount)}
      </motion.strong>
    </AnimatePresence>
  );
}

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <span className={`eyebrow${light ? " eyebrow-light" : ""}`}><span />{children}</span>;
}

function Toast({ toast, onDismiss }: { toast: ToastItem | null; onDismiss: () => void }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          className={`toast toast-${toast.tone}`}
          role={toast.tone === "error" ? "alert" : "status"}
          aria-live={toast.tone === "error" ? "assertive" : "polite"}
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.2 }}
        >
          <span className="toast-icon">{toast.tone === "error" ? <X size={16} /> : <Check size={16} />}</span>
          <span>{toast.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={onDismiss}><X size={15} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DishCard({
  dish,
  quantity,
  index,
  onQuantity,
}: {
  dish: Dish;
  quantity: number;
  index: number;
  onQuantity: (dish: Dish, amount: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.article
      className={`dish-card${dish.available ? "" : " dish-card-unavailable"}`}
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 22 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.42, delay: reduceMotion ? 0 : (index % 4) * 0.055 }}
    >
      <div className="dish-image-wrap">
        <img
          className="dish-image"
          src={dish.img || "/images/pulao-hero.jpg"}
          alt={dish.name}
          loading="lazy"
          onError={(event) => { event.currentTarget.src = "/images/pulao-hero.jpg"; }}
        />
        <span className="dish-category">{dish.category}</span>
        {!dish.available && <span className="dish-unavailable-label">Currently unavailable</span>}
      </div>
      <div className="dish-content">
        <div className="dish-heading-row">
          <h3>{dish.name}</h3>
          <span className="dish-price">{formatPrice(dish.price)}</span>
        </div>
        {dish.description && <p className="dish-description">{dish.description}</p>}
        <div className="dish-controls">
          <div className={`quantity-control${quantity > 0 ? " quantity-control-active" : ""}`} aria-label={`Quantity of ${dish.name}`}>
            <button type="button" aria-label={`Remove one ${dish.name}`} disabled={!dish.available || quantity === 0} onClick={() => onQuantity(dish, -1)}><Minus size={14} /></button>
            <span aria-live="polite">{quantity}</span>
            <button type="button" aria-label={`Add one ${dish.name}`} disabled={!dish.available} onClick={() => onQuantity(dish, 1)}><Plus size={14} /></button>
          </div>
          <button className="button button-add" type="button" disabled={!dish.available} onClick={() => onQuantity(dish, 1)}>
            {quantity > 0 ? "Add another" : "Add to cart"}<ArrowRight size={15} />
          </button>
        </div>
      </div>
    </motion.article>
  );
}

function EmptyState({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}

function ModalShell({
  children,
  onClose,
  className = "",
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
  label: string;
}) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const firstControl = panel?.querySelector<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)");
    firstControl?.focus();
    return () => previousFocus?.focus();
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const controls = Array.from(panelRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)"));
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <motion.div
      className="modal-backdrop"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <motion.section
        className={`modal-panel ${className}`}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={handleKeyDown}
        initial={reduceMotion ? false : { opacity: 0, y: 22, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.985 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
      >
        {children}
      </motion.section>
    </motion.div>
  );
}

function ChatWindow({
  orderId,
  sender,
  onClose,
}: {
  orderId: string;
  sender: "Customer" | "Admin";
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Array<{ id: string; sender: string; text: string; createdAt: number }>>([]);
  const [isClosed, setIsClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    const conversationRef = ref(database, `chats/${orderId}`);
    const unsubscribe = onValue(conversationRef, (snapshot) => {
      const data = snapshot.val() as Record<string, unknown> | null;
      const messageMap = data && data.messages && typeof data.messages === "object"
        ? data.messages as Record<string, Record<string, unknown>>
        : {};
      const next = Object.entries(messageMap).map(([id, value]) => ({
        id,
        sender: typeof value.senderRole === "string" ? value.senderRole : typeof value.sender === "string" ? value.sender : "Restaurant",
        text: typeof value.text === "string" ? value.text : typeof value.message === "string" ? value.message : "",
        createdAt: Number(value.createdAt) || Number(value.timestamp) || 0,
      })).filter((message) => message.text).sort((a, b) => a.createdAt - b.createdAt);
      setMessages(next);
      const meta = data?.meta && typeof data.meta === "object" ? data.meta as Record<string, unknown> : {};
      setIsClosed(meta.closed === true);
      setLoading(false);
    }, (reason) => {
      setError(reason.message || "Chat could not be loaded. Please check your connection.");
      setLoading(false);
    });
    return unsubscribe;
  }, [orderId]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || text.length > 800 || sending || (isClosed && sender === "Customer")) return;
    setSending(true);
    try {
      const messageRef = push(ref(database, `chats/${orderId}/messages`));
      await set(messageRef, {
        senderRole: sender,
        sender,
        text,
        createdAt: Date.now(),
      });
      setDraft("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <ModalShell onClose={onClose} className="chat-modal" label={`Order support chat ${orderId}`}>
      <div className="chat-header">
        <div className="chat-avatar"><MessageCircle size={19} /></div>
        <div><p className="chat-kicker">Order support</p><h2>{orderId}</h2></div>
        <span className={`connection-dot${isClosed ? " connection-dot-muted" : ""}`} title={isClosed ? "Conversation closed" : "Conversation open"} />
        <button className="icon-button modal-close" type="button" aria-label="Close chat" onClick={onClose}><X size={19} /></button>
      </div>
      {isClosed && <div className="chat-closed-note">This conversation is closed. Your messages remain saved with the order.</div>}
      <div className="chat-body" ref={scroller} aria-live="polite">
        {loading ? <div className="chat-loading"><LoaderCircle className="spin" size={22} />Loading conversation...</div> : null}
        {!loading && error && <p className="inline-error">{error}</p>}
        {!loading && !error && messages.length === 0 && (
          <EmptyState icon={<MessageCircle size={22} />} title="A fresh conversation" detail="Send a message if you need help with this order." />
        )}
        {!loading && messages.map((message) => {
          const isSelf = message.sender === sender;
          return (
            <motion.div className={`chat-message-row${isSelf ? " chat-message-self" : ""}`} key={message.id} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }}>
              <div className={`chat-bubble${isSelf ? " chat-bubble-self" : ""}`}>
                <span className="chat-sender">{isSelf ? "You" : message.sender === "Admin" ? "Pulao Master" : "Customer"}</span>
                <p>{message.text}</p>
                <time>{message.createdAt ? new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit" }).format(new Date(message.createdAt)) : "Just now"}</time>
              </div>
            </motion.div>
          );
        })}
      </div>
      <form className="chat-compose" onSubmit={sendMessage}>
        <label className="sr-only" htmlFor={`chat-message-${orderId}`}>Write a message</label>
        <input
          id={`chat-message-${orderId}`}
          value={draft}
          maxLength={800}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={isClosed && sender === "Customer" ? "This conversation is closed" : "Write a message..."}
          disabled={sending || (isClosed && sender === "Customer")}
        />
        <button className="button button-primary chat-send" type="submit" disabled={!draft.trim() || sending || (isClosed && sender === "Customer")} aria-label="Send message">
          {sending ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}
        </button>
      </form>
      <p className="chat-footnote">Messages are saved with this order. Please do not share payment details here.</p>
    </ModalShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusClass = status.toLowerCase().replace(/ /g, "-");
  return <span className={`status-badge status-${statusClass}`}><span />{status}</span>;
}

function ProgressSteps({ status }: { status: OrderStatus }) {
  const steps: OrderStatus[] = ["Pending", "Confirmed", "Preparing", "Ready for Delivery", "Completed"];
  const currentIndex = steps.indexOf(status);
  const cancelled = status === "Cancelled";
  return (
    <div className="order-progress" aria-label={`Current order status: ${status}`}>
      {steps.map((step, index) => {
        const done = !cancelled && index <= currentIndex;
        return (
          <div className={`progress-step${done ? " progress-step-done" : ""}${step === status ? " progress-step-current" : ""}`} key={step}>
            <span>{done && index < currentIndex ? <Check size={13} /> : index + 1}</span>
            <small>{step}</small>
          </div>
        );
      })}
    </div>
  );
}

function TrackOrderSection({ prefillId, showToast }: { prefillId: string; showToast: (message: string, tone?: ToastItem["tone"]) => void }) {
  const [orderId, setOrderId] = useState(prefillId);
  const [last4, setLast4] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [track, setTrack] = useState<TrackRecord | null>(null);
  const [liveId, setLiveId] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (prefillId) setOrderId(prefillId);
  }, [prefillId]);

  useEffect(() => {
    if (!liveId) return undefined;
    const unsubscribe = onValue(ref(database, `trackOrders/${liveId}`), (snapshot) => {
      const value = snapshot.val() as Record<string, unknown> | null;
      if (value) {
        setTrack(normalizeTrack(liveId, value));
      } else {
        setTrack(null);
        setLiveId("");
        setError("This order is no longer available.");
      }
    }, (reason) => {
      setError(reason.message || "Live updates stopped. Check your connection and try again.");
    });
    return unsubscribe;
  }, [liveId]);

  async function lookupOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = orderId.trim().toUpperCase();
    const digits = last4.trim();
    if (!/^PM-[A-Z0-9]{5,20}-\d{4}$/.test(id)) {
      setError("Enter your Order ID exactly as shown on your confirmation, for example PM-ABC123XY-4821.");
      return;
    }
    if (!/^\d{4}$/.test(digits)) {
      setError("Enter the last 4 digits of the phone number used for this order.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const snapshot = await get(ref(database, `trackOrders/${id}`));
      const value = snapshot.val() as Record<string, unknown> | null;
      if (!value || String(value.phoneLast4 ?? "") !== digits) {
        setTrack(null);
        setLiveId("");
        setError("No order matches these details. Check the Order ID and the last 4 digits of your phone number.");
        return;
      }
      setTrack(normalizeTrack(id, value));
      setLiveId(id);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The order could not be found right now.";
      setError(`${message.replace("Firebase: ", "")} Please try again.`);
      showToast("Tracking is unavailable right now.", "error");
    } finally {
      setBusy(false);
    }
  }

  function resetTracking() {
    setTrack(null);
    setLiveId("");
    setLast4("");
    setError("");
  }

  return (
    <section className="track-section" id="track" aria-labelledby="track-title">
      <div className="track-inner">
        <div className="track-intro">
          <Eyebrow>Order updates</Eyebrow>
          <h2 id="track-title">Track your <em>order.</em></h2>
          <p>Enter the Order ID from your confirmation and the last 4 digits of your phone number. Your status updates here live as the kitchen works on it.</p>
        </div>
        <div className="track-card">
          <form className="track-form" onSubmit={lookupOrder}>
            <label>Order ID
              <input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="PM-XXXXXXXX-0000" autoComplete="off" maxLength={40} required />
            </label>
            <label>Last 4 digits of phone
              <input value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="1234" autoComplete="off" maxLength={4} required />
            </label>
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? <><LoaderCircle className="spin" size={16} /> Checking</> : <><Search size={16} /> Track</>}
            </button>
            {error && <p className="inline-error" role="alert">{error}</p>}
          </form>

          {track && (
            <div className="track-result" aria-live="polite">
              <div className="tracking-order-line">
                <div><span className="small-label">Order ID</span><strong>{track.orderId}</strong></div>
                <StatusBadge status={track.status} />
              </div>
              <ProgressSteps status={track.status} />
              {track.status === "Cancelled" && <p className="cancelled-note">This order was cancelled. Please contact the restaurant if you need help.</p>}
              <div className="tracking-detail-strip"><span>Items</span><strong>{track.itemsSummary || "Details saved with the restaurant"}</strong></div>
              <div className="tracking-detail-strip"><span>Order total</span><strong>{formatPrice(track.total)}</strong></div>
              <div className="tracking-detail-strip"><span>Placed</span><strong>{formatDate(track.createdAt)}</strong></div>
              <div className="tracking-detail-strip"><span>Last updated</span><strong>{formatDate(track.updatedAt)}</strong></div>
              <div className="tracking-actions">
                <button className="button button-outline" type="button" onClick={() => setChatOpen(true)}><MessageCircle size={16} /> Open order chat</button>
                <button className="text-button" type="button" onClick={resetTracking}>Track another order</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <AnimatePresence>
        {chatOpen && track && <ChatWindow orderId={track.orderId} sender="Customer" onClose={() => setChatOpen(false)} />}
      </AnimatePresence>
    </section>
  );
}

function AdminDashboard({
  user,
  dishes,
  settings,
  onSignOut,
  onClose,
  showToast,
}: {
  user: User;
  dishes: Dish[];
  settings: PublicSettings;
  onSignOut: () => void;
  onClose: () => void;
  showToast: (message: string, tone?: ToastItem["tone"]) => void;
}) {
  const [tab, setTab] = useState("Overview");
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Needs attention");
  const [dateFilter, setDateFilter] = useState("Any date");
  const [page, setPage] = useState(1);
  const [chatOrderId, setChatOrderId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ kind: "order" | "dish"; id: string; label: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingDish, setEditingDish] = useState<Dish | null>(null);
  const [dishForm, setDishForm] = useState({ name: "", price: "", img: "", description: "", category: "", available: true });
  const [settingsForm, setSettingsForm] = useState<PublicSettings>(settings);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const ordersPerPage = 7;

  useEffect(() => {
    setOrdersLoading(true);
    const unsubscribe = onValue(ref(database, "orders"), (snapshot) => {
      const raw = snapshot.val() as Record<string, Record<string, unknown>> | null;
      const result = Object.entries(raw ?? {}).map(([key, value]) => normalizeOrder(key, value));
      result.sort((a, b) => b.createdAt - a.createdAt);
      setOrders(result);
      setOrdersLoading(false);
      setOrdersError("");
    }, (reason) => {
      setOrdersError(reason.message || "Order records could not be loaded.");
      setOrdersLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => setSettingsForm(settings), [settings]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaysOrders = orders.filter((order) => order.createdAt >= todayStart.getTime());
  const pendingCount = orders.filter((order) => !["Completed", "Cancelled"].includes(order.status)).length;
  const completedCount = orders.filter((order) => order.status === "Completed").length;
  const todaysValue = todaysOrders.reduce((sum, order) => sum + order.total, 0);
  const todayTime = todayStart.getTime();

  const filteredOrders = useMemo(() => orders.filter((order) => {
    const matchesQuery = `${order.id} ${order.customer.name} ${order.customer.phone}`.toLowerCase().includes(query.toLowerCase().trim());
    const matchesStatus = statusFilter === "All statuses"
      || (statusFilter === "Needs attention" ? !["Completed", "Cancelled"].includes(order.status) : order.status === statusFilter);
    const minimumDate = dateFilter === "Today" ? todayTime
      : dateFilter === "Last 7 days" ? Date.now() - 7 * 24 * 60 * 60 * 1000
        : dateFilter === "Last 30 days" ? Date.now() - 30 * 24 * 60 * 60 * 1000 : 0;
    return matchesQuery && matchesStatus && order.createdAt >= minimumDate;
  }), [orders, query, statusFilter, dateFilter, todayTime]);

  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / ordersPerPage));
  const visibleOrders = filteredOrders.slice((page - 1) * ordersPerPage, page * ordersPerPage);

  useEffect(() => setPage(1), [query, statusFilter, dateFilter]);

  async function updateOrder(orderKey: string, status: OrderStatus, displayId = orderKey) {
    setSaving(true);
    try {
      const updatedAt = Date.now();
      await Promise.all([
        update(ref(database, `orders/${orderKey}`), { status, updatedAt }),
        update(ref(database, `trackOrders/${displayId}`), { status, updatedAt }),
        update(ref(database, `chats/${displayId}/meta`), { closed: status === "Completed" || status === "Cancelled" }),
      ]);
      showToast(`Order ${displayId} marked ${status.toLowerCase()}.`);
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Order status could not be updated.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeOrder(orderKey: string) {
    setSaving(true);
    const order = orders.find((item) => item.databaseKey === orderKey);
    try {
      await remove(ref(database, `orders/${orderKey}`));
      if (order) {
        await Promise.all([
          remove(ref(database, `trackOrders/${order.id}`)),
          remove(ref(database, `chats/${order.id}`)),
        ]);
      }
      showToast("Order record removed.", "info");
      setSelectedOrder(null);
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Order could not be deleted.", "error");
    } finally {
      setSaving(false);
      setConfirmAction(null);
    }
  }

  function startDishEdit(dish: Dish | null) {
    setEditingDish(dish);
    setDishForm(dish ? {
      name: dish.name,
      price: String(dish.price),
      img: dish.img,
      description: dish.description,
      category: dish.category,
      available: dish.available,
    } : { name: "", price: "", img: "", description: "", category: "", available: true });
    setTab("Menu");
    window.setTimeout(() => document.getElementById("dish-name")?.focus(), 80);
  }

  async function saveDish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = Number(dishForm.price);
    if (!dishForm.name.trim() || !dishForm.category.trim() || !Number.isFinite(price) || price < 0) {
      showToast("Enter a dish name, category, and valid price.", "error");
      return;
    }
    setSaving(true);
    try {
      const dishData = {
        name: dishForm.name.trim(),
        price,
        img: dishForm.img.trim(),
        description: dishForm.description.trim(),
        category: dishForm.category.trim(),
        available: dishForm.available,
        sortOrder: editingDish ? editingDish.sortOrder : dishes.length + 1,
        updatedAt: Date.now(),
      };

      if (editingDish) {
        await update(ref(database, `dishes/${editingDish.databaseKey || editingDish.id}`), dishData);
      } else {
        const newDishRef = push(ref(database, "dishes"));
        await set(newDishRef, { ...dishData, id: newDishRef.key });
      }

      showToast(editingDish ? "Dish details updated." : "Dish added to the menu.");
      setEditingDish(null);
      setDishForm({ name: "", price: "", img: "", description: "", category: "", available: true });
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Dish could not be saved.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailability(dish: Dish) {
    try {
      await update(ref(database, `dishes/${dish.databaseKey || dish.id}`), { available: !dish.available });
      showToast(`${dish.name} is now ${dish.available ? "unavailable" : "available"}.`);
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Availability could not be changed.", "error");
    }
  }

  async function reorderDish(dish: Dish, direction: -1 | 1) {
    const sorted = [...dishes].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = sorted.findIndex((item) => item.id === dish.id);
    const neighbour = sorted[index + direction];
    if (!neighbour) return;
    try {
      await Promise.all([
        update(ref(database, `dishes/${dish.databaseKey || dish.id}`), { sortOrder: neighbour.sortOrder }),
        update(ref(database, `dishes/${neighbour.databaseKey || neighbour.id}`), { sortOrder: dish.sortOrder }),
      ]);
      showToast("Menu order updated.");
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Menu order could not be saved.", "error");
    }
  }

  async function deleteDish(dishKey: string) {
    setSaving(true);
    try {
      await remove(ref(database, `dishes/${dishKey}`));
      showToast("Dish removed from the menu.", "info");
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Dish could not be deleted.", "error");
    } finally {
      setSaving(false);
      setConfirmAction(null);
    }
  }

  async function seedStarterMenu() {
    if (!window.confirm("Add the starter menu to Firebase? Starter dishes with the same ID will be reset to the starter values. Other dishes are not changed.")) return;
    setSaving(true);
    try {
      await Promise.all(defaultDishes.map((dish) => set(ref(database, `dishes/${dish.id}`), { ...dish, updatedAt: Date.now() })));
      showToast("Starter menu saved to Firebase.");
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Starter menu could not be saved.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settingsForm.restaurantName.trim() || !settingsForm.contactNumber.trim() || !settingsForm.address.trim()) {
      showToast("Restaurant name, contact number, and address are required.", "error");
      return;
    }
    setSaving(true);
    try {
      await set(ref(database, "settings/public"), {
        ...settingsForm,
        deliveryFee: settingsForm.deliveryFeeEnabled ? Number(settingsForm.deliveryFee) : 0,
        updatedAt: Date.now(),
      });
      setSettingsSaved(true);
      window.setTimeout(() => setSettingsSaved(false), 2200);
      showToast("Restaurant settings saved.");
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Settings could not be saved.", "error");
    } finally {
      setSaving(false);
    }
  }

  const navItems = [
    { label: "Overview", icon: <Sparkles size={17} /> },
    { label: "Orders", icon: <ShoppingBag size={17} /> },
    { label: "Menu", icon: <Soup size={17} /> },
    { label: "Settings", icon: <ShieldCheck size={17} /> },
  ];

  return (
    <motion.div className="admin-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <aside className="admin-sidebar">
        <div className="admin-brand"><BrandMark compact restaurantName={settings.restaurantName} /><span className="admin-console-label">OWNER CONSOLE</span></div>
        <nav className="admin-nav" aria-label="Dashboard sections">
          {navItems.map((item) => <button key={item.label} className={`admin-nav-item${tab === item.label ? " admin-nav-active" : ""}`} type="button" onClick={() => setTab(item.label)}>{item.icon}<span>{item.label}</span>{item.label === "Orders" && pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}</button>)}
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-user"><span className="admin-avatar"><img src="/images/pulaomaster-logo.jpg" alt="" width={34} height={34} decoding="async" /></span><div><strong>{user.displayName || "Administrator"}</strong><small>{user.email}</small></div></div>
          <button className="admin-signout" type="button" onClick={onSignOut}>Sign out <ArrowRight size={15} /></button>
          <button className="admin-back-link" type="button" onClick={onClose}><ArrowLeft size={15} /> Return to storefront</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div><span className="admin-topbar-crumb">{settings.restaurantName} /</span><h1>{tab}</h1></div>
          <div className="admin-topbar-right"><span className="live-indicator"><i /> Live database</span><button className="icon-button admin-mobile-close" type="button" onClick={onClose} aria-label="Return to storefront"><X size={19} /></button></div>
        </header>

        {tab === "Overview" && (
          <section className="admin-page-content">
            <div className="admin-welcome"><div><Eyebrow>Restaurant control room</Eyebrow><h2>Good to see you, {user.displayName?.split(" ")[0] || "there"}.</h2><p>Your latest service activity, all in one place.</p></div><span className="admin-date">{new Intl.DateTimeFormat("en-PK", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</span></div>
            <div className="stat-grid">
              <StatTile label="All orders" value={orders.length} icon={<ShoppingBag size={18} />} />
              <StatTile label="Needs attention" value={pendingCount} icon={<Clock3 size={18} />} tone="red" />
              <StatTile label="Completed" value={completedCount} icon={<CheckCircle2 size={18} />} tone="green" />
              <StatTile label="Today's orders" value={todaysOrders.length} icon={<Truck size={18} />} />
              <StatTile label="Menu items" value={dishes.length} icon={<Soup size={18} />} />
            </div>
            <div className="revenue-strip"><div><span className="small-label">Today's order value</span><strong>{formatPrice(todaysValue)}</strong><p>Order value only; payment is collected directly from the customer.</p></div><div className="revenue-mark"><CreditCard size={24} /><span>Orders are paid directly upon delivery</span></div></div>
            <div className="admin-section-heading"><div><Eyebrow>Live activity</Eyebrow><h3>Recent orders</h3></div><button className="text-button" type="button" onClick={() => setTab("Orders")}>All orders <ArrowRight size={15} /></button></div>
            {ordersLoading ? <LoadingRows /> : ordersError ? <InlineError message={ordersError} /> : orders.length === 0 ? <EmptyState icon={<ShoppingBag size={23} />} title="No orders yet" detail="New customer orders will appear here as soon as they are placed." /> : (
              <div className="recent-order-list">{orders.slice(0, 5).map((order) => <OrderListRow key={order.databaseKey} order={order} onOpen={() => setSelectedOrder(order)} onChat={() => setChatOrderId(order.id)} onStatus={updateOrder} busy={saving} />)}</div>
            )}
          </section>
        )}

        {tab === "Orders" && (
          <section className="admin-page-content">
            <div className="admin-section-heading admin-orders-title"><div><Eyebrow>Order management</Eyebrow><h2>Customer orders</h2><p>Review details and keep each customer up to date.</p></div></div>
            <div className="order-filters">
              <label className="search-field"><Search size={17} /><input aria-label="Search orders" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order ID, name, phone" /></label>
              <label className="select-field"><span className="sr-only">Filter orders by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Needs attention</option><option>All statuses</option>{orderStatuses.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={15} /></label>
              <label className="select-field"><span className="sr-only">Filter orders by date</span><select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}><option>Any date</option><option>Today</option><option>Last 7 days</option><option>Last 30 days</option></select><ChevronDown size={15} /></label>
            </div>
            {ordersLoading ? <LoadingRows /> : ordersError ? <InlineError message={ordersError} /> : visibleOrders.length === 0 ? <EmptyState icon={<Search size={23} />} title="No matching orders" detail={orders.length === 0 ? "Orders will appear here when customers check out." : "Try a different search or filter."} /> : (
              <div className="recent-order-list">{visibleOrders.map((order) => <OrderListRow key={order.databaseKey} order={order} onOpen={() => setSelectedOrder(order)} onChat={() => setChatOrderId(order.id)} onStatus={updateOrder} busy={saving} onDelete={() => setConfirmAction({ kind: "order", id: order.databaseKey, label: order.id })} />)}</div>
            )}
            {filteredOrders.length > ordersPerPage && <div className="pagination"><span>Showing {((page - 1) * ordersPerPage) + 1}-{Math.min(page * ordersPerPage, filteredOrders.length)} of {filteredOrders.length}</span><div><button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={17} /></button><span>{page} / {pageCount}</span><button type="button" aria-label="Next page" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}><ChevronRight size={17} /></button></div></div>}
          </section>
        )}

        {tab === "Menu" && (
          <section className="admin-page-content">
            <div className="admin-section-heading">
              <div><Eyebrow>Menu management</Eyebrow><h2>Your menu</h2><p>Update dishes, availability, images, and prices.</p></div>
              <div className="admin-heading-actions">
                <button className="button button-outline" type="button" disabled={saving} onClick={() => void seedStarterMenu()}><Sparkles size={15} /> Add starter menu</button>
                <button className="button button-primary" type="button" onClick={() => startDishEdit(null)}><Plus size={16} /> Add a dish</button>
              </div>
            </div>
            <div className="menu-admin-layout">
              <div className="admin-menu-list">
                {dishes.length === 0 ? <EmptyState icon={<Soup size={23} />} title="Your menu is empty" detail="Add a dish or add the starter menu." /> : [...dishes].sort((a, b) => a.sortOrder - b.sortOrder).map((dish, index) => (
                  <div className="admin-menu-row" key={dish.databaseKey || dish.id}>
                    <img src={dish.img || "/images/pulao-hero.jpg"} alt="" loading="lazy" onError={(event) => { event.currentTarget.src = "/images/pulao-hero.jpg"; }} />
                    <div className="admin-menu-info"><strong>{dish.name}</strong><span>{dish.category} / {formatPrice(dish.price)}</span></div>
                    <span className={`availability-label${dish.available ? " availability-on" : " availability-off"}`}><i />{dish.available ? "Available" : "Unavailable"}</span>
                    <div className="admin-menu-actions">
                      <button type="button" title="Move up" aria-label={`Move ${dish.name} up`} disabled={index === 0} onClick={() => void reorderDish(dish, -1)}><ChevronDown className="move-up-icon" size={16} /></button>
                      <button type="button" title="Move down" aria-label={`Move ${dish.name} down`} disabled={index === dishes.length - 1} onClick={() => void reorderDish(dish, 1)}><ChevronDown size={16} /></button>
                      <button type="button" title="Edit dish" aria-label={`Edit ${dish.name}`} onClick={() => startDishEdit(dish)}><Eye size={16} /></button>
                      <button type="button" title={dish.available ? "Mark unavailable" : "Mark available"} aria-label={dish.available ? `Mark ${dish.name} unavailable` : `Mark ${dish.name} available`} onClick={() => void toggleAvailability(dish)}>{dish.available ? <EyeOff size={16} /> : <Check size={16} />}</button>
                      <button className="menu-delete" type="button" title="Delete dish" aria-label={`Delete ${dish.name}`} onClick={() => setConfirmAction({ kind: "dish", id: dish.databaseKey || dish.id, label: dish.name })}><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <form className="admin-form-panel" onSubmit={saveDish}>
                <div className="form-panel-heading"><span className="form-panel-icon"><Soup size={19} /></span><div><h3>{editingDish ? "Edit dish" : "Add a dish"}</h3><p>Menu changes sync for every visitor.</p></div>{editingDish && <button type="button" className="icon-button" aria-label="Stop editing" onClick={() => startDishEdit(null)}><X size={16} /></button>}</div>
                <label>Dish name<input id="dish-name" value={dishForm.name} onChange={(event) => setDishForm({ ...dishForm, name: event.target.value })} maxLength={80} required placeholder="For example, Special Chicken Pulao" /></label>
                <div className="form-columns"><label>Price (Rs.)<input type="number" min="0" step="1" value={dishForm.price} onChange={(event) => setDishForm({ ...dishForm, price: event.target.value })} required placeholder="0" /></label><label>Category<input value={dishForm.category} onChange={(event) => setDishForm({ ...dishForm, category: event.target.value })} maxLength={40} required placeholder="Pulao" /></label></div>
                <label>Image URL<input type="url" value={dishForm.img} onChange={(event) => setDishForm({ ...dishForm, img: event.target.value })} placeholder="https://..." /></label>
                <label>Description <span className="optional-label">Optional</span><textarea value={dishForm.description} onChange={(event) => setDishForm({ ...dishForm, description: event.target.value })} maxLength={180} rows={3} placeholder="A short menu description" /></label>
                <label className="switch-row"><span><strong>Available to order</strong><small>Unavailable dishes cannot be added to cart.</small></span><input type="checkbox" checked={dishForm.available} onChange={(event) => setDishForm({ ...dishForm, available: event.target.checked })} /></label>
                <button className="button button-primary button-wide" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Check size={16} />}{editingDish ? "Save dish changes" : "Add to menu"}</button>
              </form>
            </div>
          </section>
        )}

        {tab === "Settings" && (
          <section className="admin-page-content">
            <div className="admin-section-heading"><div><Eyebrow>Public information</Eyebrow><h2>Restaurant settings</h2><p>These details appear on the customer-facing website.</p></div></div>
            <form className="settings-form" onSubmit={saveSettings}>
              <div className="settings-section-head"><span><MapPin size={18} /></span><div><h3>Restaurant details</h3><p>Keep contact information current for customers.</p></div></div>
              <div className="settings-grid">
                <label>Restaurant name<input value={settingsForm.restaurantName} maxLength={80} onChange={(event) => setSettingsForm({ ...settingsForm, restaurantName: event.target.value })} required /></label>
                <label>Contact number<input value={settingsForm.contactNumber} maxLength={24} onChange={(event) => setSettingsForm({ ...settingsForm, contactNumber: event.target.value })} required /></label>
                <label>WhatsApp number (with country code)<input value={settingsForm.whatsappNumber} maxLength={20} onChange={(event) => setSettingsForm({ ...settingsForm, whatsappNumber: event.target.value })} /></label>
                <label>Restaurant address<input value={settingsForm.address} maxLength={180} onChange={(event) => setSettingsForm({ ...settingsForm, address: event.target.value })} required /></label>
                <label>Opening hours <span className="optional-label">Optional</span><input value={settingsForm.openingHours} maxLength={120} onChange={(event) => setSettingsForm({ ...settingsForm, openingHours: event.target.value })} placeholder="Add hours when confirmed" /></label>
                <label>Tagline<input value={settingsForm.tagline} maxLength={120} onChange={(event) => setSettingsForm({ ...settingsForm, tagline: event.target.value })} /></label>
              </div>
              <div className="settings-section-head settings-subhead"><span><Truck size={18} /></span><div><h3>Delivery and menu</h3><p>Publish a delivery fee when confirmed.</p></div></div>
              <div className="settings-grid settings-grid-bottom">
                <label className="switch-row"><span><strong>Set a delivery fee</strong><small>Customers will see this included in their total.</small></span><input type="checkbox" checked={settingsForm.deliveryFeeEnabled} onChange={(event) => setSettingsForm({ ...settingsForm, deliveryFeeEnabled: event.target.checked })} /></label>
                <label>Delivery fee (Rs.)<input type="number" min="0" step="1" value={settingsForm.deliveryFeeEnabled ? settingsForm.deliveryFee : ""} disabled={!settingsForm.deliveryFeeEnabled} onChange={(event) => setSettingsForm({ ...settingsForm, deliveryFee: Number(event.target.value) })} placeholder="Not configured" /></label>
                <label className="switch-row"><span><strong>Show the online menu</strong><small>Temporarily hide ordering while you update the menu.</small></span><input type="checkbox" checked={settingsForm.menuVisible} onChange={(event) => setSettingsForm({ ...settingsForm, menuVisible: event.target.checked })} /></label>
              </div>
              <div className="settings-submit"><p>Settings save directly to Firebase Realtime Database.</p><button className="button button-primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : settingsSaved ? <Check size={16} /> : null}{settingsSaved ? "Saved" : "Save settings"}</button></div>
            </form>
          </section>
        )}
      </main>

      <AnimatePresence>{selectedOrder && <OrderDetailsModal order={selectedOrder} onClose={() => setSelectedOrder(null)} onChat={() => { setSelectedOrder(null); setChatOrderId(selectedOrder.id); }} onStatus={updateOrder} onDelete={() => { setSelectedOrder(null); setConfirmAction({ kind: "order", id: selectedOrder.databaseKey, label: selectedOrder.id }); }} busy={saving} />}</AnimatePresence>
      <AnimatePresence>{chatOrderId && <ChatWindow orderId={chatOrderId} sender="Admin" onClose={() => setChatOrderId("")} />}</AnimatePresence>
      <AnimatePresence>{confirmAction && <ConfirmDialog title={confirmAction.kind === "order" ? "Delete this order?" : "Remove this dish?"} description={confirmAction.kind === "order" ? `Order ${confirmAction.label} and its saved chat history will be permanently deleted.` : `${confirmAction.label} will be removed from the live menu.`} confirmLabel={confirmAction.kind === "order" ? "Delete order" : "Delete dish"} busy={saving} onCancel={() => setConfirmAction(null)} onConfirm={() => confirmAction.kind === "order" ? void removeOrder(confirmAction.id) : void deleteDish(confirmAction.id)} />}</AnimatePresence>
    </motion.div>
  );
}

function StatTile({ label, value, icon, tone = "" }: { label: string; value: number; icon: ReactNode; tone?: string }) {
  return <div className={`stat-tile${tone ? ` stat-tile-${tone}` : ""}`}><span className="stat-icon">{icon}</span><div><span>{label}</span><strong>{value.toLocaleString("en-PK")}</strong></div></div>;
}

function LoadingRows() {
  return <div className="loading-rows" aria-label="Loading orders"><span /><span /><span /></div>;
}

function InlineError({ message }: { message: string }) {
  return <div className="inline-error-box"><X size={17} /><p>{message}</p></div>;
}

function OrderListRow({
  order,
  onOpen,
  onChat,
  onStatus,
  onDelete,
  busy,
}: {
  order: OrderRecord;
  onOpen: () => void;
  onChat: () => void;
  onStatus: (orderKey: string, status: OrderStatus, displayId?: string) => void;
  onDelete?: () => void;
  busy: boolean;
}) {
  const [nextStatus, setNextStatus] = useState<OrderStatus>(order.status);
  useEffect(() => setNextStatus(order.status), [order.status]);
  return (
    <article className="admin-order-row">
      <div className="admin-order-main">
        <div className="admin-order-primary"><strong>{order.id}</strong><StatusBadge status={order.status} /></div>
        <div className="admin-order-customer"><strong>{order.customer.name}</strong><span>{order.customer.phone || "No phone number"}</span><time>{formatDate(order.createdAt)}</time></div>
        <p className="admin-order-items">{order.items.map((item) => `${item.name} x ${item.qty}`).join(" / ") || "No item details available"}</p>
        {order.customer.address && <p className="admin-order-address"><MapPin size={12} />{order.customer.address}</p>}
      </div>
      <div className="admin-order-side"><strong>{formatPrice(order.total)}</strong><span>{order.deliveryFeeConfigured ? "Includes delivery fee" : "Delivery fee not configured"}</span><div className="admin-order-actions"><button className="button button-sm button-outline" type="button" onClick={onOpen}>Details</button><button className="icon-button" type="button" aria-label={`Open chat for ${order.id}`} onClick={onChat}><MessageCircle size={17} /></button>{onDelete && <button className="icon-button order-delete" type="button" aria-label={`Delete ${order.id}`} onClick={onDelete}><Trash2 size={16} /></button>}</div></div>
      <div className="admin-order-update"><label className="sr-only" htmlFor={`status-${order.databaseKey}`}>Change status for {order.id}</label><select id={`status-${order.databaseKey}`} value={nextStatus} onChange={(event) => setNextStatus(event.target.value as OrderStatus)}>{orderStatuses.map((status) => <option key={status}>{status}</option>)}</select><button type="button" disabled={busy || nextStatus === order.status} onClick={() => onStatus(order.databaseKey, nextStatus, order.id)}>{busy ? <LoaderCircle className="spin" size={14} /> : "Update"}</button></div>
    </article>
  );
}

function OrderDetailsModal({
  order,
  onClose,
  onChat,
  onStatus,
  onDelete,
  busy,
}: {
  order: OrderRecord;
  onClose: () => void;
  onChat: () => void;
  onStatus: (orderKey: string, status: OrderStatus, displayId?: string) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [nextStatus, setNextStatus] = useState<OrderStatus>(order.status);
  return (
    <ModalShell onClose={onClose} className="order-detail-modal" label={`Order details for ${order.id}`}>
      <div className="modal-heading-row"><div><Eyebrow>Customer order</Eyebrow><h2>{order.id}</h2></div><button className="icon-button" type="button" aria-label="Close order details" onClick={onClose}><X size={19} /></button></div>
      <div className="detail-status-row"><StatusBadge status={order.status} /><span>{formatDate(order.createdAt)}</span></div>
      <div className="detail-customer"><h3>Delivery details</h3><p><strong>{order.customer.name}</strong></p><a href={`tel:${cleanPhone(order.customer.phone)}`}><Phone size={15} />{order.customer.phone || "No phone number"}</a><p><MapPin size={15} />{order.customer.address || "No address supplied"}</p>{order.deliveryInstructions && <p className="delivery-instructions"><strong>Instructions</strong>{order.deliveryInstructions}</p>}</div>
      <div className="detail-lines"><h3>Order items</h3>{order.items.map((item, index) => <div className="detail-line" key={`${item.id}-${index}`}><span>{item.name} <small>x {item.qty}</small></span><strong>{formatPrice(item.price * item.qty)}</strong></div>)}<div className="detail-line"><span>Subtotal</span><strong>{formatPrice(order.subtotal)}</strong></div><div className="detail-line"><span>Delivery fee</span><strong>{order.deliveryFeeConfigured ? formatPrice(order.deliveryFee) : "To be confirmed"}</strong></div><div className="detail-line detail-total"><span>{order.deliveryFeeConfigured ? "Total" : "Subtotal before delivery fee"}</span><strong>{formatPrice(order.total)}</strong></div></div>
      <div className="detail-manage"><label>Status<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as OrderStatus)}>{orderStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><button className="button button-primary" type="button" disabled={busy || nextStatus === order.status} onClick={() => onStatus(order.databaseKey, nextStatus, order.id)}>{busy ? <LoaderCircle className="spin" size={16} /> : "Update status"}</button></div>
      <div className="detail-footer-actions"><button className="button button-outline" type="button" onClick={onChat}><MessageCircle size={16} /> Open order chat</button><button className="text-button text-button-danger" type="button" onClick={onDelete}><Trash2 size={15} /> Delete order</button></div>
    </ModalShell>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell onClose={onCancel} className="confirm-modal" label={title}>
      <span className="confirm-icon"><Trash2 size={20} /></span><h2>{title}</h2><p>{description}</p>
      <div className="confirm-actions"><button className="button button-outline" type="button" onClick={onCancel} disabled={busy}>Keep it</button><button className="button button-danger" type="button" onClick={onConfirm} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : null}{confirmLabel}</button></div>
    </ModalShell>
  );
}

export default function App() {
  const reduceMotion = useReducedMotion();
  const [dishes, setDishes] = useState<Dish[]>(defaultDishes.map((d) => ({ ...d })));
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");
  const [settings, setSettings] = useState<PublicSettings>(appDefaultSettings);
  const [connection, setConnection] = useState<"checking" | "online" | "offline">("checking");
  const [cart, setCart] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("pulao-master-cart");
      return saved ? JSON.parse(saved) as Record<string, number> : {};
    } catch {
      return {};
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const [trackPrefill, setTrackPrefill] = useState("");
  const [checkoutForm, setCheckoutForm] = useState({ name: "", phone: "", address: "", instructions: "" });
  const [orderBusy, setOrderBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("recommended");
  const [toast, setToast] = useState<ToastItem | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [adminAllowed, setAdminAllowed] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [ownerNotice, setOwnerNotice] = useState<OwnerNotice | null>(null);
  const [dashboardOpen, setDashboardOpen] = useState(false);

  const showToast = useCallback((message: string, tone: ToastItem["tone"] = "success") => {
    setToast({ id: Date.now(), message, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  useEffect(() => {
    const menuUnsubscribe = onValue(ref(database, "dishes"), (snapshot) => {
      if (!snapshot.exists()) {
        setDishes(defaultDishes.map((d) => ({ ...d })));
      } else {
        const data = snapshot.val() as Record<string, Record<string, unknown>>;
        const nextDishes = Object.entries(data)
          .map(([key, value]) => normalizeDish(key, value))
          .filter((dish): dish is Dish => dish !== null);
        nextDishes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
        setDishes(nextDishes);
      }
      setMenuLoading(false);
      setMenuError("");
    }, (reason) => {
      setDishes(defaultDishes.map((d) => ({ ...d })));
      setMenuLoading(false);
      setMenuError(reason.message || "");
      setConnection("offline");
    });

    const settingsUnsubscribe = onValue(ref(database, "settings/public"), (snapshot) => {
      const data = snapshot.val() as Partial<PublicSettings> | null;
      if (data) setSettings({ ...appDefaultSettings, ...data, deliveryFee: Number(data.deliveryFee) || 0 });
    }, () => undefined);

    const connectionUnsubscribe = onValue(ref(database, ".info/connected"), (snapshot) => {
      setConnection(snapshot.val() === true ? "online" : "offline");
    });

    return () => {
      menuUnsubscribe();
      settingsUnsubscribe();
      connectionUnsubscribe();
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem("pulao-master-cart", JSON.stringify(cart)); } catch { /* Storage unavailable */ }
  }, [cart]);

  useEffect(() => {
    if (menuLoading) return;
    setCart((current) => Object.fromEntries(Object.entries(current).filter(([id, qty]) => {
      const dish = dishes.find((item) => item.id === id || item.databaseKey === id);
      return dish?.available && Number.isFinite(qty) && qty > 0;
    }).map(([id, qty]) => [id, Math.min(99, Math.floor(qty))])));
  }, [dishes, menuLoading]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAdminUser(user);
      if (!user) {
        setAdminAllowed(false);
        setDashboardOpen(false);
        return;
      }
      setAdminAllowed(isApprovedAdminEmail(user.email));
    });
    // Consume any leftover redirect result from an earlier sign-in attempt.
    getRedirectResult(auth).catch(() => undefined);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const hasModal = cartOpen || checkoutOpen || orderConfirmation !== null || ownerNotice !== null || dashboardOpen;
    if (!hasModal) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (dashboardOpen) setDashboardOpen(false);
      else if (ownerNotice) setOwnerNotice(null);
      else if (orderConfirmation) setOrderConfirmation(null);
      else if (checkoutOpen) setCheckoutOpen(false);
      else if (cartOpen) setCartOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cartOpen, checkoutOpen, orderConfirmation, ownerNotice, dashboardOpen]);

  const categories = useMemo(() => ["All", ...Array.from(new Set(dishes.map((dish) => dish.category).filter(Boolean)))], [dishes]);
  const filteredDishes = useMemo(() => {
    const result = dishes.filter((dish) => {
      const matchesCategory = category === "All" || dish.category === category;
      const matchesSearch = `${dish.name} ${dish.description} ${dish.category}`.toLowerCase().includes(search.toLowerCase().trim());
      const matchesAvailability = availabilityFilter === "all" || (availabilityFilter === "available" ? dish.available : !dish.available);
      return matchesCategory && matchesSearch && matchesAvailability;
    });
    if (sortOrder === "price-low") result.sort((a, b) => a.price - b.price);
    if (sortOrder === "price-high") result.sort((a, b) => b.price - a.price);
    return result;
  }, [dishes, category, availabilityFilter, search, sortOrder]);

  const cartKeyOf = (dish: Dish) => dish.id || dish.databaseKey || dish.name;
  const cartItems = useMemo(() => dishes
    .filter((dish) => dish.available && (cart[cartKeyOf(dish)] || 0) > 0)
    .map((dish) => ({ dish, qty: cart[cartKeyOf(dish)] || 0 })), [dishes, cart]);

  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = cartItems.reduce((sum, item) => sum + item.dish.price * item.qty, 0);
  const deliveryFee = settings.deliveryFeeEnabled ? settings.deliveryFee : 0;

  function updateQuantity(dish: Dish, amount: number) {
    if (amount > 0 && !dish.available) {
      showToast("This dish is currently unavailable.", "error");
      return;
    }
    const key = cartKeyOf(dish);
    setCart((current) => {
      const nextAmount = Math.max(0, Math.min(99, (current[key] || 0) + amount));
      const next = { ...current };
      if (nextAmount === 0) delete next[key];
      else next[key] = nextAmount;
      return next;
    });
  }

  function openCheckout() {
    if (cartCount === 0) return;
    setCartOpen(false);
    setCheckoutError("");
    setCheckoutOpen(true);
  }

  function openTrack(prefill = "") {
    setMobileOpen(false);
    setOrderConfirmation(null);
    if (prefill) setTrackPrefill(prefill);
    window.setTimeout(() => document.getElementById("track")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  async function submitOrder(event: { preventDefault: () => void }, viaWhatsApp = false) {
    event.preventDefault();
    if (orderBusy) return;
    const name = checkoutForm.name.trim();
    const phone = cleanPhone(checkoutForm.phone);
    const address = checkoutForm.address.trim();
    if (name.length < 2) { setCheckoutError("Enter your full name."); return; }
    if (!isValidPakistaniPhone(phone)) { setCheckoutError("Enter a valid Pakistani mobile number, such as 03001234567."); return; }
    if (address.length < 8) { setCheckoutError("Enter a complete delivery address."); return; }
    if (!cartItems.length) { setCheckoutError("Your cart is empty. Add an available dish before checkout."); return; }

    setOrderBusy(true);
    setCheckoutError("");
    const popup = viaWhatsApp ? window.open("about:blank", "_blank") : null;
    const orderId = `PM-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      const total = subtotal + deliveryFee;
      const itemsSummary = cartItems.map(({ dish, qty }) => `${dish.name} x ${qty}`).join(", ");
      const orderRecord = {
        id: orderId,
        customer: { name, phone, address },
        items: cartItems.map(({ dish, qty }) => ({ id: dish.id, name: dish.name, price: dish.price, qty })),
        subtotal,
        deliveryFee,
        deliveryFeeConfigured: settings.deliveryFeeEnabled,
        total,
        status: "Pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deliveryInstructions: checkoutForm.instructions.trim(),
      };
      const trackRecord = {
        orderId,
        status: "Pending",
        itemsSummary,
        total,
        phoneLast4: phone.slice(-4),
        createdAt: orderRecord.createdAt,
        updatedAt: orderRecord.createdAt,
      };

      const newOrderRef = push(ref(database, "orders"));
      await Promise.all([
        set(newOrderRef, orderRecord),
        set(ref(database, `trackOrders/${orderId}`), trackRecord),
      ]);

      const orderText = [
        `*NEW ORDER RECEIVED (#${orderId}) - ${settings.restaurantName}*`,
        `*Customer:* ${name}`,
        `*Phone:* ${phone}`,
        `*Address:* ${address}`,
        checkoutForm.instructions.trim() ? `*Instructions:* ${checkoutForm.instructions.trim()}` : "",
        "*Items:*",
        ...cartItems.map((item) => `- ${item.dish.name} x ${item.qty}: ${formatPrice(item.dish.price * item.qty)}`),
        `*Subtotal:* ${formatPrice(subtotal)}`,
        settings.deliveryFeeEnabled ? `*Delivery fee:* ${formatPrice(deliveryFee)}` : "*Delivery fee:* To be confirmed",
        `*Total Payable:* ${formatPrice(total)}`,
      ].filter(Boolean).join("\n");

      const whatsappUrl = `https://wa.me/${settings.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(orderText)}`;
      setCart({});
      setCheckoutOpen(false);
      setCheckoutForm({ name: "", phone: "", address: "", instructions: "" });
      setOrderConfirmation({ orderId, total, whatsappUrl });
      showToast("Your order has been placed successfully!");

      if (viaWhatsApp) {
        if (popup) popup.location.href = whatsappUrl;
        else showToast("Order saved. Tap WhatsApp on the confirmation screen to message us.", "info");
      }
    } catch (reason) {
      popup?.close();
      setCheckoutError(reason instanceof Error ? reason.message.replace("Firebase: ", "") : "Your order could not be saved. Please check your connection.");
    } finally {
      setOrderBusy(false);
    }
  }

  // Owner access: one Google account chooser. No password, no redirect page.
  // The Google email must be on the owner list, otherwise the account is signed out again.
  async function signInOwner() {
    if (authBusy) return;
    if (adminAllowed && adminUser) {
      setDashboardOpen(true);
      return;
    }
    setAuthBusy(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const result = await signInWithPopup(auth, provider);
      const email = result.user.email ?? "";
      if (isApprovedAdminEmail(email)) {
        setAdminUser(result.user);
        setAdminAllowed(true);
        setDashboardOpen(true);
        showToast(`Welcome back, ${result.user.displayName?.split(" ")[0] || "Owner"}.`);
      } else {
        await signOut(auth);
        setOwnerNotice({
          title: "Access denied",
          message: "This Google account is not on the owner list. Please choose an approved Gmail account.",
          email,
        });
      }
    } catch (reason) {
      const code = authCode(reason);
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // The user closed the Google window; nothing else to show.
      } else if (code === "auth/popup-blocked") {
        setOwnerNotice({
          title: "Popup blocked",
          message: "Your browser blocked the Google window. Allow popups for this website in the address bar, then press Owner access again.",
        });
      } else {
        setOwnerNotice({ title: "Sign-in did not work", message: describeAuthError(code) });
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOutOwner() {
    await signOut(auth);
    setDashboardOpen(false);
    showToast("You have signed out.", "info");
  }

  function ownerAccessClick() {
    setMobileOpen(false);
    void signInOwner();
  }

  function directWhatsApp() {
    const text = encodeURIComponent(`Hello, I would like to ask ${settings.restaurantName} a question about the menu.`);
    window.open(`https://wa.me/${settings.whatsappNumber.replace(/\D/g, "")}?text=${text}`, "_blank", "noopener,noreferrer");
  }

  const desktopNav = (
    <>
      <a href="#home">Home</a>
      <a href="#menu">Menu</a>
      <a href="#about">Our story</a>
      <a href="#contact">Contact</a>
    </>
  );

  // Hamburger menu: Track order sits directly below Contact.
  const mobileNav = (
    <>
      <a href="#home" onClick={() => setMobileOpen(false)}>Home</a>
      <a href="#menu" onClick={() => setMobileOpen(false)}>Menu</a>
      <a href="#about" onClick={() => setMobileOpen(false)}>Our story</a>
      <a href="#contact" onClick={() => setMobileOpen(false)}>Contact</a>
      <a href="#track" className="nav-track-link" onClick={() => openTrack()}><Clock3 size={15} /> Track order</a>
    </>
  );

  return (
    <>
      {dashboardOpen && adminAllowed && adminUser ? (
        <AdminDashboard user={adminUser} dishes={dishes} settings={settings} onSignOut={() => void signOutOwner()} onClose={() => setDashboardOpen(false)} showToast={showToast} />
      ) : (
        <div className="site-shell" id="home">
          <header className="site-header">
            <div className="nav-inner">
              <BrandMark restaurantName={settings.restaurantName} />
              <nav className="desktop-nav" aria-label="Main navigation">{desktopNav}</nav>
              <div className="nav-actions">
                <button className="cart-nav-button" type="button" onClick={() => setCartOpen(true)} aria-label={`Open cart with ${cartCount} items`}>
                  <ShoppingBag size={18} /><span>Cart</span><motion.b key={cartCount} initial={{ scale: 0.75 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 440, damping: 18 }}>{cartCount}</motion.b>
                </button>
                {adminAllowed && <button className="nav-admin-button" type="button" onClick={() => setDashboardOpen(true)}>Dashboard <ArrowRight size={14} /></button>}
                <button className={`mobile-menu-button${mobileOpen ? " mobile-menu-open" : ""}`} type="button" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)}>{mobileOpen ? <X size={22} /> : <MenuIcon size={22} />}</button>
              </div>
            </div>
            <AnimatePresence>
              {mobileOpen && (
                <>
                  <motion.button className="mobile-nav-backdrop" type="button" aria-label="Close navigation backdrop" onClick={() => setMobileOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
                  <motion.nav className="mobile-nav" aria-label="Mobile navigation" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}>
                    {mobileNav}
                    <button type="button" className="mobile-owner-link" onClick={ownerAccessClick}>Owner access</button>
                  </motion.nav>
                </>
              )}
            </AnimatePresence>
          </header>

          <main>
            <section className="hero-section" aria-labelledby="hero-title">
              <div className="hero-image" role="img" aria-label="Pakistani chicken pulao with fragrant rice in a copper serving pot" />
              <div className="hero-inner">
                <motion.div className="hero-copy" initial={reduceMotion ? false : { opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.72, delay: 0.08 }}>
                  <Eyebrow light>Traditional Pakistani kitchen</Eyebrow>
                  <p className="hero-brandline">{settings.restaurantName}</p>
                  <h1 id="hero-title">Where tradition<br /><em>meets the table.</em></h1>
                  <p className="hero-tagline">{settings.tagline}</p>
                  <div className="hero-actions">
                    <a className="button button-light" href="#menu">Explore the menu <ArrowRight size={16} /></a>
                    <button className="button button-hero-quiet" type="button" onClick={directWhatsApp}><MessageCircle size={17} /> Order on WhatsApp</button>
                  </div>
                </motion.div>
                <motion.div className="hero-aside" initial={reduceMotion ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduceMotion ? 0 : 0.8, delay: 0.34 }}>
                  <span className="hero-aside-mark"><Soup size={22} /></span>
                  <span>Food with a sense<br />of home.</span>
                  <span className="hero-aside-line" />
                  <small>LAHORE / PAKISTAN</small>
                </motion.div>
                <a className="hero-scroll" href="#highlights"><span>Discover our kitchen</span><ArrowDown size={15} /></a>
              </div>
              <div className="hero-bottom-rule" />
            </section>

            <section className="highlights-section" id="highlights" aria-label="Restaurant highlights">
              <div className="highlights-inner">
                <div className="highlight-intro"><span className="highlight-number">01</span><span>Rooted in the<br />Pakistani table</span></div>
                <div className="highlight-item"><span className="highlight-icon"><Soup size={20} /></span><div><strong>Authentic cuisine</strong><p>Traditional dishes, familiar flavours.</p></div></div>
                <div className="highlight-item"><span className="highlight-icon"><Sparkles size={19} /></span><div><strong>Made to order</strong><p>Choose from the menu and order online.</p></div></div>
                <div className="highlight-item"><span className="highlight-icon"><Heart size={19} /></span><div><strong>Warm hospitality</strong><p>A thoughtful experience from start to finish.</p></div></div>
              </div>
            </section>

            <section className="menu-section section-space" id="menu">
              <div className="section-topline"><Eyebrow>From our kitchen</Eyebrow><span className={`connection-label connection-${connection}`}><i />{connection === "online" ? "Live menu" : "Offline"}</span></div>
              <div className="menu-title-row"><div><h2>Make room for<br /><em>something good.</em></h2><p>Explore the menu and order your favourites for home.</p></div><span className="menu-index">02 <span>/ MENU</span></span></div>
              <div className="menu-toolbar">
                <div className="category-filters" role="group" aria-label="Filter menu by category">
                  {categories.map((item) => <button className={category === item ? "filter-active" : ""} type="button" key={item} onClick={() => setCategory(item)}>{item}</button>)}
                </div>
                <div className="menu-search-tools">
                  <label className="menu-search"><Search size={16} /><input aria-label="Search menu" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a dish" /><kbd>/</kbd></label>
                  <label className="sort-select availability-select"><span className="sr-only">Filter dishes by availability</span><select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)}><option value="all">All availability</option><option value="available">Available only</option><option value="unavailable">Unavailable</option></select><ChevronDown size={14} /></label>
                  <label className="sort-select"><span className="sr-only">Sort menu items</span><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}><option value="recommended">Menu order</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select><ChevronDown size={14} /></label>
                </div>
              </div>
              {!settings.menuVisible ? (
                <EmptyState icon={<Clock3 size={24} />} title="The online menu is taking a short pause" detail="Please contact the restaurant on WhatsApp for current menu information." action={<button className="button button-primary" type="button" onClick={directWhatsApp}>Ask on WhatsApp <ArrowRight size={15} /></button>} />
              ) : menuLoading ? (
                <div className="menu-grid" aria-label="Loading menu">{[0, 1, 2].map((key) => <div className="dish-skeleton" key={key}><span /><div><i /><i /><b /></div></div>)}</div>
              ) : menuError ? (
                <div className="menu-error"><InlineError message={menuError} /><button className="button button-outline" type="button" onClick={() => window.location.reload()}>Reconnect</button></div>
              ) : filteredDishes.length ? (
                <div className="menu-grid">{filteredDishes.map((dish, index) => <DishCard key={cartKeyOf(dish)} dish={dish} quantity={cart[cartKeyOf(dish)] || 0} index={index} onQuantity={updateQuantity} />)}</div>
              ) : (
                <EmptyState icon={<Search size={23} />} title="No dishes found" detail="Try a different category or search term." action={search || category !== "All" || availabilityFilter !== "all" ? <button className="text-button" type="button" onClick={() => { setSearch(""); setCategory("All"); setAvailabilityFilter("all"); }}>Clear filters</button> : undefined} />
              )}
              <div className="menu-bottom-note"><span><i /> Menu availability updates live</span><button type="button" className="text-button" onClick={() => openTrack()}>Already ordered? Track it <ArrowRight size={14} /></button></div>
            </section>

            <TrackOrderSection prefillId={trackPrefill} showToast={showToast} />

            <section className="about-section" id="about">
              <div className="about-image-wrap"><img src="/images/pulao-hero.jpg" alt="A traditional pulao meal prepared for the table" loading="lazy" /><span className="about-stamp"><CookingPot size={21} /><span>Made for<br />the table</span></span></div>
              <div className="about-copy"><Eyebrow>Our approach</Eyebrow><span className="about-index">04 / ABOUT</span><h2>Good food has a way<br />of bringing us <em>together.</em></h2><p>{settings.restaurantName} celebrates the familiar comfort of Pakistani cooking. Explore a menu inspired by traditional flavours, then place an order with a few simple steps.</p><p>Whether you are planning a shared meal or a quiet evening in, we are here to make ordering feel easy.</p><a className="text-link" href="#menu">Find something for the table <ArrowRight size={16} /></a></div>
            </section>

            <section className="contact-section" id="contact">
              <div className="contact-heading"><Eyebrow light>Come say hello</Eyebrow><h2>Need a hand<br />with your <em>order?</em></h2><p>Our team is happy to help with menu questions and order enquiries.</p><button className="button button-light" type="button" onClick={directWhatsApp}><MessageCircle size={17} /> Chat with us on WhatsApp <ArrowRight size={15} /></button></div>
              <div className="contact-details">
                <div className="contact-detail"><span className="contact-detail-icon"><Phone size={18} /></span><div><small>Call the restaurant</small><a href={`tel:${settings.contactNumber.replace(/[^\d+]/g, "")}`}>{settings.contactNumber}</a></div></div>
                <div className="contact-detail"><span className="contact-detail-icon"><MapPin size={18} /></span><div><small>Find us in</small><strong>{settings.address}</strong></div></div>
                {settings.openingHours && <div className="contact-detail"><span className="contact-detail-icon"><Clock3 size={18} /></span><div><small>Opening hours</small><strong>{settings.openingHours}</strong></div></div>}
                <div className="contact-separator" />
                <form className="enquiry-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const message = `Hello ${settings.restaurantName}, my name is ${String(data.get("enquiryName") || "")}. ${String(data.get("enquiryMessage") || "")}`; window.open(`https://wa.me/${settings.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer"); event.currentTarget.reset(); }}>
                  <span className="enquiry-title">Send a quick enquiry</span><div className="enquiry-row"><label className="sr-only" htmlFor="enquiry-name">Your name</label><input id="enquiry-name" name="enquiryName" placeholder="Your name" required maxLength={60} /><label className="sr-only" htmlFor="enquiry-message">Your message</label><input id="enquiry-message" name="enquiryMessage" placeholder="How can we help?" required maxLength={300} /><button className="enquiry-send" type="submit" aria-label="Send enquiry on WhatsApp"><ArrowRight size={17} /></button></div><small>Opens a WhatsApp message to the restaurant.</small>
                </form>
              </div>
            </section>
          </main>

          <footer className="site-footer">
            <div className="footer-main"><div className="footer-brand"><BrandMark inverted restaurantName={settings.restaurantName} /><p>{settings.tagline}</p><span className="footer-location"><MapPin size={14} /> {settings.address}</span></div><div className="footer-links"><span>Explore</span><a href="#home">Home</a><a href="#menu">Menu</a><a href="#track">Track order</a><a href="#about">Our story</a><a href="#contact">Contact</a></div><div className="footer-links"><span>Get in touch</span><a href={`tel:${settings.contactNumber.replace(/[^\d+]/g, "")}`}>{settings.contactNumber}</a><button type="button" onClick={directWhatsApp}>WhatsApp us <ExternalLink size={13} /></button></div><div className="footer-bike"><span>On its way to your table</span><div className="bike-road"><Bike size={45} strokeWidth={1.35} /><i /></div><small>Good things are worth sharing.</small></div></div>
            <div className="footer-bottom"><span>(c) {new Date().getFullYear()} {settings.restaurantName}. All rights reserved.</span><button type="button" className="owner-access-link" onClick={ownerAccessClick}>{adminAllowed ? "Owner dashboard" : "Owner access"}</button><span>Made with care in Lahore</span></div>
          </footer>

          <AnimatePresence>
            {cartOpen && (
              <motion.div className="drawer-overlay" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
                <motion.aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="Shopping cart" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}>
                  <div className="drawer-header"><div><Eyebrow>Your order</Eyebrow><h2>Your cart <span>({cartCount})</span></h2></div><button className="icon-button" type="button" onClick={() => setCartOpen(false)} aria-label="Close cart"><X size={20} /></button></div>
                  {cartItems.length === 0 ? (
                    <div className="cart-empty"><EmptyState icon={<ShoppingBag size={24} />} title="Nothing in your cart yet" detail="Browse the menu and add something you love." action={<button className="button button-outline" type="button" onClick={() => { setCartOpen(false); document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" }); }}>Explore the menu <ArrowRight size={15} /></button>} /></div>
                  ) : (
                    <>
                      <div className="cart-items">{cartItems.map(({ dish, qty }) => <div className="cart-item" key={cartKeyOf(dish)}><img src={dish.img || "/images/pulao-hero.jpg"} alt="" /><div className="cart-item-info"><strong>{dish.name}</strong><span>{formatPrice(dish.price)} each</span><div className="cart-item-quantity"><button type="button" aria-label={`Remove one ${dish.name}`} onClick={() => updateQuantity(dish, -1)}><Minus size={13} /></button><span>{qty}</span><button type="button" aria-label={`Add one ${dish.name}`} onClick={() => updateQuantity(dish, 1)}><Plus size={13} /></button></div></div><strong className="cart-item-total">{formatPrice(dish.price * qty)}</strong></div>)}</div>
                      <div className="cart-summary"><button type="button" className="text-button text-button-danger" onClick={() => { setCart({}); showToast("Cart cleared.", "info"); }}>Clear cart</button><div className="summary-line"><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div><div className="summary-line"><span>Delivery fee</span><strong>{settings.deliveryFeeEnabled ? formatPrice(deliveryFee) : "To be confirmed"}</strong></div><div className="summary-total"><span>{settings.deliveryFeeEnabled ? "Total" : "Subtotal before delivery fee"}</span><AnimatedAmount amount={subtotal + deliveryFee} /></div>{!settings.deliveryFeeEnabled && <p className="delivery-note">The restaurant will confirm any delivery fee before accepting the order.</p>}<button className="button button-primary button-wide" type="button" onClick={openCheckout}>Continue to checkout <ArrowRight size={16} /></button></div>
                    </>
                  )}
                </motion.aside>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {checkoutOpen && (
              <ModalShell onClose={() => !orderBusy && setCheckoutOpen(false)} className="checkout-modal" label="Checkout">
                <div className="modal-heading-row"><div><Eyebrow>Almost there</Eyebrow><h2>Complete your order</h2><p>We will use these details to confirm your delivery.</p></div><button className="icon-button" type="button" onClick={() => setCheckoutOpen(false)} disabled={orderBusy} aria-label="Close checkout"><X size={19} /></button></div>
                <form className="checkout-form" onSubmit={(event) => void submitOrder(event, false)}>
                  <div className="checkout-fields"><label>Full name<input value={checkoutForm.name} onChange={(event) => setCheckoutForm({ ...checkoutForm, name: event.target.value })} autoComplete="name" required maxLength={80} placeholder="Your name" /></label><label>Mobile number<input type="tel" value={checkoutForm.phone} onChange={(event) => setCheckoutForm({ ...checkoutForm, phone: event.target.value })} autoComplete="tel" required maxLength={18} placeholder="03XX XXXXXXX" /><small>Pakistani mobile number</small></label><label className="checkout-wide-field">Delivery address<textarea value={checkoutForm.address} onChange={(event) => setCheckoutForm({ ...checkoutForm, address: event.target.value })} autoComplete="street-address" required minLength={8} maxLength={300} rows={2} placeholder="House, street, area, and city" /></label><label className="checkout-wide-field">Delivery instructions <span className="optional-label">Optional</span><textarea value={checkoutForm.instructions} onChange={(event) => setCheckoutForm({ ...checkoutForm, instructions: event.target.value })} maxLength={300} rows={2} placeholder="Any helpful details for finding your address" /></label></div>
                  <div className="checkout-order-summary"><div className="checkout-summary-head"><strong>Order summary</strong><span>{cartCount} item{cartCount === 1 ? "" : "s"}</span></div>{cartItems.map(({ dish, qty }) => <div className="checkout-summary-line" key={cartKeyOf(dish)}><span>{dish.name} x {qty}</span><strong>{formatPrice(dish.price * qty)}</strong></div>)}<div className="checkout-summary-line"><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div><div className="checkout-summary-line"><span>Delivery fee</span><strong>{settings.deliveryFeeEnabled ? formatPrice(deliveryFee) : "To be confirmed"}</strong></div><div className="checkout-summary-total"><span>{settings.deliveryFeeEnabled ? "Total" : "Subtotal before delivery fee"}</span><AnimatedAmount amount={subtotal + deliveryFee} /></div>{!settings.deliveryFeeEnabled && <p className="delivery-note">Any delivery fee will be confirmed by the restaurant.</p>}</div>
                  {checkoutError && <p className="checkout-error" role="alert">{checkoutError}</p>}
                  <div className="checkout-submit-actions"><button className="button button-primary button-wide" type="submit" disabled={orderBusy || !cartItems.length}>{orderBusy ? <><LoaderCircle className="spin" size={17} /> Saving your order</> : <>Place order <ArrowRight size={16} /></>}</button><button className="button button-whatsapp button-wide" type="button" disabled={orderBusy || !cartItems.length} onClick={(event) => void submitOrder(event, true)}><MessageCircle size={17} /> Save order & continue to WhatsApp</button><p>Order details are saved before WhatsApp opens.</p></div>
                </form>
              </ModalShell>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {orderConfirmation && (
              <ModalShell onClose={() => setOrderConfirmation(null)} className="success-modal" label="Order placed successfully">
                <span className="success-mark"><CheckCircle2 size={31} /></span><Eyebrow>Order received</Eyebrow><h2>Thank you for<br /><em>choosing us.</em></h2><p>Your order is saved. Keep your Order ID to track it.</p>
                <div className="success-order-number"><span>Order ID</span><strong>{orderConfirmation.orderId}</strong></div>
                <div className="success-order-number"><span>Order total</span><strong>{formatPrice(orderConfirmation.total)}</strong></div>
                <p className="form-hint">To track, enter this Order ID and the last 4 digits of your phone number in the Track Order section.</p>
                <div className="success-actions">
                  <button className="button button-primary button-wide" type="button" onClick={() => openTrack(orderConfirmation.orderId)}>Track this order <ArrowRight size={16} /></button>
                  {orderConfirmation.whatsappUrl && <a className="button button-outline button-wide" href={orderConfirmation.whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Share order on WhatsApp</a>}
                  <button type="button" className="text-button" onClick={() => setOrderConfirmation(null)}>Continue browsing</button>
                </div>
              </ModalShell>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {ownerNotice && (
              <ModalShell onClose={() => setOwnerNotice(null)} className="owner-modal" label={ownerNotice.title}>
                <div className="owner-modal-top"><BrandMark restaurantName={settings.restaurantName} /><button className="icon-button" type="button" aria-label="Close" onClick={() => setOwnerNotice(null)}><X size={19} /></button></div>
                <span className="owner-lock-icon owner-lock-denied"><ShieldCheck size={23} /></span>
                <Eyebrow>Owner access</Eyebrow>
                <h2>{ownerNotice.title}</h2>
                <p>{ownerNotice.message}</p>
                {ownerNotice.email && <div className="signed-in-email">Signed in as <strong>{ownerNotice.email}</strong></div>}
                <div className="owner-modal-actions">
                  {ownerNotice.email && <button className="button button-primary button-wide" type="button" onClick={() => { setOwnerNotice(null); void signInOwner(); }}>Try another Google account <ArrowRight size={16} /></button>}
                  <button type="button" className="text-button" onClick={() => setOwnerNotice(null)}>Close</button>
                </div>
              </ModalShell>
            )}
          </AnimatePresence>
        </div>
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}


