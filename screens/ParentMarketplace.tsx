import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useColors, Colors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { moderateImage } from '../lib/contentModeration';
import ContentBlockedModal from '../components/ContentBlockedModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type PriceType = 'fixed' | 'obo' | 'free';
type Condition  = 'like_new' | 'good' | 'fair';

type Listing = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  price: number | null;
  price_type: PriceType;
  category: string;
  condition: Condition | null;
  city: string | null;
  state_name: string | null;
  image_url: string | null;
  is_sold: boolean;
  created_at: string;
};

type Conversation = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  listing_title?: string;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window');
const CARD_W = (SW - 48) / 2; // 20px side padding + 8px gap each side

const CATEGORIES = [
  { id: 'all',       label: 'All',                emoji: '🛍️' },
  { id: 'clothing',  label: 'Clothing & Shoes',   emoji: '👗' },
  { id: 'feeding',   label: 'Feeding',             emoji: '🍼' },
  { id: 'sleep',     label: 'Sleep',               emoji: '🛏️' },
  { id: 'travel',    label: 'Strollers & Car Seats', emoji: '🚗' },
  { id: 'toys',      label: 'Toys & Play',         emoji: '🧸' },
  { id: 'books',     label: 'Books & Media',       emoji: '📚' },
  { id: 'safety',    label: 'Health & Safety',     emoji: '🏥' },
  { id: 'bath',      label: 'Bath & Care',         emoji: '🛁' },
  { id: 'carriers',  label: 'Carriers & Bags',     emoji: '👜' },
  { id: 'furniture', label: 'Furniture',           emoji: '🪑' },
  { id: 'other',     label: 'Other',               emoji: '📦' },
] as const;

const CONDITIONS: { id: Condition; label: string }[] = [
  { id: 'like_new', label: 'Like New' },
  { id: 'good',     label: 'Good'     },
  { id: 'fair',     label: 'Fair'     },
];

const PRICE_TYPES: { id: PriceType; label: string }[] = [
  { id: 'fixed', label: 'Fixed Price'    },
  { id: 'obo',   label: 'Best Offer'    },
  { id: 'free',  label: 'Free / Gifting' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(price: number | null, type: PriceType): string {
  if (type === 'free') return 'Free';
  if (!price) return '';
  const d = price % 1 === 0 ? price.toFixed(0) : price.toFixed(2);
  return type === 'obo' ? `$${d} OBO` : `$${d}`;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60)          return `${mins}m ago`;
  if (mins < 1440)        return `${Math.floor(mins / 60)}h ago`;
  if (mins < 10080)       return `${Math.floor(mins / 1440)}d ago`;
  return `${Math.floor(mins / 10080)}w ago`;
}

function catEmoji(id: string) {
  return CATEGORIES.find(c => c.id === id)?.emoji ?? '📦';
}
function condLabel(id: Condition | null) {
  return id ? (CONDITIONS.find(c => c.id === id)?.label ?? '') : '';
}

async function uploadImage(uri: string, userId: string): Promise<string | null> {
  try {
    const res  = await fetch(uri);
    const blob = await res.blob();
    const ext  = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('marketplace-images')
      .upload(path, blob, { contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}` });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage
      .from('marketplace-images')
      .getPublicUrl(path);
    return publicUrl;
  } catch {
    return null;
  }
}

// ─── ListingCard ──────────────────────────────────────────────────────────────

function ListingCard({
  listing,
  onPress,
  c,
}: {
  listing: Listing;
  onPress: () => void;
  c: ReturnType<typeof useColors>;
}) {
  const s    = cardSt(c);
  const isFree = listing.price_type === 'free';

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>
      {/* Image */}
      {listing.image_url ? (
        <Image source={{ uri: listing.image_url }} style={s.img} resizeMode="cover" />
      ) : (
        <View style={s.imgPlaceholder}>
          <Text style={{ fontSize: 36 }}>{catEmoji(listing.category)}</Text>
        </View>
      )}

      {listing.is_sold && (
        <View style={s.soldBanner}><Text style={s.soldText}>SOLD</Text></View>
      )}

      <View style={s.body}>
        <Text style={s.title} numberOfLines={2}>{listing.title}</Text>
        <Text style={[s.price, isFree && s.priceGreen]}>
          {formatPrice(listing.price, listing.price_type)}
        </Text>
        {listing.condition && (
          <Text style={s.cond}>{condLabel(listing.condition)}</Text>
        )}
        {listing.city && (
          <Text style={s.loc} numberOfLines={1}>📍 {listing.city}</Text>
        )}
        <Text style={s.time}>{timeAgo(listing.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const cardSt = (c: Colors) =>
  StyleSheet.create({
    card: {
      width: CARD_W,
      backgroundColor: c.card,
      borderRadius: 14,
      overflow: 'hidden',
    },
    img: { width: '100%', height: CARD_W * 0.85 },
    imgPlaceholder: {
      width: '100%',
      height: CARD_W * 0.85,
      backgroundColor: c.cardLavender,
      alignItems: 'center',
      justifyContent: 'center',
    },
    soldBanner: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: 'rgba(0,0,0,0.6)',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    soldText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    body: { padding: 10, gap: 3 },
    title: { fontSize: 13, fontWeight: '700', color: c.textPrimary, lineHeight: 17 },
    price: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    priceGreen: { color: '#16A34A' },
    cond:  { fontSize: 11, fontWeight: '600', color: c.textMuted },
    loc:   { fontSize: 11, color: c.textMuted, fontWeight: '500' },
    time:  { fontSize: 11, color: c.textMuted, fontWeight: '400' },
  });

// ─── ConversationModal ────────────────────────────────────────────────────────

function ConversationModal({
  visible,
  conversationId,
  listingTitle,
  currentUserId,
  onClose,
  c,
}: {
  visible: boolean;
  conversationId: string | null;
  listingTitle: string;
  currentUserId: string;
  onClose: () => void;
  c: ReturnType<typeof useColors>;
}) {
  const [messages, setMessages]  = useState<Message[]>([]);
  const [text, setText]          = useState('');
  const [loading, setLoading]    = useState(true);
  const [sending, setSending]    = useState(false);
  const scrollRef                = useRef<ScrollView>(null);
  const s                        = convSt(c);

  useEffect(() => {
    if (visible && conversationId) {
      fetchMessages();
    }
  }, [visible, conversationId]);

  const fetchMessages = async () => {
    if (!conversationId) return;
    setLoading(true);
    const { data } = await supabase
      .from('marketplace_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at');
    setMessages(data ?? []);
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
  };

  const send = async () => {
    const content = text.trim();
    if (!content || !conversationId || sending) return;
    setSending(true);
    setText('');
    const { data } = await supabase
      .from('marketplace_messages')
      .insert({ conversation_id: conversationId, sender_id: currentUserId, content })
      .select()
      .single();
    if (data) {
      setMessages(prev => [...prev, data]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
    setSending(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <SafeAreaView style={s.container}>
          <View style={s.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.back}>← Back</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle} numberOfLines={1}>Re: {listingTitle}</Text>
            <TouchableOpacity onPress={fetchMessages}>
              <Text style={s.refresh}>↻</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={c.blush} style={{ flex: 1 }} />
          ) : (
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={s.msgList}
              showsVerticalScrollIndicator={false}
            >
              {messages.length === 0 && (
                <Text style={s.empty}>No messages yet — say hello!</Text>
              )}
              {messages.map(msg => {
                const mine = msg.sender_id === currentUserId;
                return (
                  <View key={msg.id} style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs]}>
                    <Text style={[s.bubbleText, mine ? s.bubbleTextMine : s.bubbleTextTheirs]}>
                      {msg.content}
                    </Text>
                    <Text style={[s.bubbleTime, mine ? s.bubbleTimeMine : s.bubbleTimeTheirs]}>
                      {timeAgo(msg.created_at)}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              placeholder="Send a message..."
              placeholderTextColor={c.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[s.sendBtn, (!text.trim() || sending) && s.sendBtnDisabled]}
              onPress={send}
              disabled={!text.trim() || sending}
            >
              <Text style={s.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const convSt = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.card,
      gap: 10,
    },
    back:        { fontSize: 15, fontWeight: '700', color: c.textSecondary },
    headerTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: c.textPrimary },
    refresh:     { fontSize: 20, color: c.textMuted, fontWeight: '700' },
    msgList:     { padding: 16, gap: 10, flexGrow: 1 },
    empty:       { textAlign: 'center', color: c.textMuted, fontSize: 14, marginTop: 40 },
    bubble: {
      maxWidth: '78%',
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 3,
    },
    bubbleMine:          { backgroundColor: c.blush,   alignSelf: 'flex-end'  },
    bubbleTheirs:        { backgroundColor: c.card,    alignSelf: 'flex-start' },
    bubbleText:          { fontSize: 15, lineHeight: 21 },
    bubbleTextMine:      { color: '#fff', fontWeight: '500' },
    bubbleTextTheirs:    { color: c.textPrimary, fontWeight: '500' },
    bubbleTime:          { fontSize: 11 },
    bubbleTimeMine:      { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
    bubbleTimeTheirs:    { color: c.textMuted },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: 12,
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: c.card,
    },
    input: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 15,
      color: c.textPrimary,
      maxHeight: 100,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.blush,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
    sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 2 },
  });

// ─── DetailModal ──────────────────────────────────────────────────────────────

function DetailModal({
  listing,
  currentUserId,
  onClose,
  onMessage,
  onMarkSold,
  c,
}: {
  listing: Listing | null;
  currentUserId: string;
  onClose: () => void;
  onMessage: (listing: Listing) => void;
  onMarkSold: (id: string) => void;
  c: ReturnType<typeof useColors>;
}) {
  const s = detailSt(c);
  if (!listing) return null;

  const isMine = listing.user_id === currentUserId;
  const priceText = formatPrice(listing.price, listing.price_type);
  const isFree = listing.price_type === 'free';

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.close}>Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {/* Image */}
          {listing.image_url ? (
            <Image source={{ uri: listing.image_url }} style={s.img} resizeMode="cover" />
          ) : (
            <View style={s.imgPlaceholder}>
              <Text style={{ fontSize: 56 }}>{catEmoji(listing.category)}</Text>
            </View>
          )}

          {listing.is_sold && (
            <View style={s.soldBadge}><Text style={s.soldBadgeText}>SOLD</Text></View>
          )}

          {/* Info */}
          <View style={s.info}>
            <Text style={s.title}>{listing.title}</Text>
            <Text style={[s.price, isFree && s.priceGreen]}>{priceText}</Text>

            <View style={s.metaRow}>
              {listing.condition && (
                <View style={s.metaBadge}>
                  <Text style={s.metaBadgeText}>✓ {condLabel(listing.condition)}</Text>
                </View>
              )}
              <View style={s.metaBadge}>
                <Text style={s.metaBadgeText}>{catEmoji(listing.category)} {CATEGORIES.find(c => c.id === listing.category)?.label}</Text>
              </View>
            </View>

            {(listing.city || listing.state_name) && (
              <Text style={s.loc}>
                📍 {[listing.city, listing.state_name].filter(Boolean).join(', ')}
              </Text>
            )}

            {listing.description && (
              <Text style={s.desc}>{listing.description}</Text>
            )}

            <Text style={s.posted}>Posted {timeAgo(listing.created_at)}</Text>
          </View>

          {/* Actions */}
          {!listing.is_sold && (
            isMine ? (
              <TouchableOpacity style={s.soldBtn} onPress={() => { onClose(); onMarkSold(listing.id); }}>
                <Text style={s.soldBtnText}>Mark as Sold</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.msgBtn} onPress={() => onMessage(listing)}>
                <Text style={s.msgBtnText}>💬 Message Seller</Text>
              </TouchableOpacity>
            )
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const detailSt = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, alignItems: 'flex-end' },
    close: { fontSize: 16, fontWeight: '700', color: c.textSecondary },
    body:  { paddingBottom: 48 },
    img:   { width: '100%', height: SW * 0.72, backgroundColor: c.card },
    imgPlaceholder: {
      width: '100%', height: SW * 0.5,
      backgroundColor: c.cardLavender,
      alignItems: 'center', justifyContent: 'center',
    },
    soldBadge: {
      alignSelf: 'flex-start',
      marginHorizontal: 20,
      marginTop: 12,
      backgroundColor: '#374151',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    soldBadgeText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 1 },
    info:  { padding: 20, gap: 8 },
    title: { fontSize: 22, fontWeight: '800', color: c.textPrimary, lineHeight: 28 },
    price: { fontSize: 26, fontWeight: '800', color: c.textPrimary },
    priceGreen: { color: '#16A34A' },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
    metaBadge: {
      backgroundColor: c.cardLavender,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    metaBadgeText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    loc:  { fontSize: 14, color: c.textMuted, fontWeight: '500' },
    desc: { fontSize: 15, color: c.textSecondary, lineHeight: 22, fontWeight: '400', marginTop: 4 },
    posted: { fontSize: 12, color: c.textMuted, fontWeight: '400' },
    msgBtn: {
      marginHorizontal: 20,
      backgroundColor: c.blush,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
    },
    msgBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    soldBtn: {
      marginHorizontal: 20,
      backgroundColor: c.card,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: c.textMuted,
    },
    soldBtnText: { color: c.textMuted, fontSize: 15, fontWeight: '700' },
  });

// ─── InboxModal ───────────────────────────────────────────────────────────────

function InboxModal({
  visible,
  currentUserId,
  onOpenConv,
  onClose,
  c,
}: {
  visible: boolean;
  currentUserId: string;
  onOpenConv: (conv: Conversation) => void;
  onClose: () => void;
  c: ReturnType<typeof useColors>;
}) {
  const [convs, setConvs]   = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const s = inboxSt(c);

  useEffect(() => {
    if (visible) fetchConvs();
  }, [visible]);

  const fetchConvs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('marketplace_conversations')
      .select('*, listing:marketplace_listings(title)')
      .or(`buyer_id.eq.${currentUserId},seller_id.eq.${currentUserId}`)
      .order('created_at', { ascending: false });

    setConvs(
      (data ?? []).map((d: any) => ({
        id: d.id,
        listing_id: d.listing_id,
        buyer_id: d.buyer_id,
        seller_id: d.seller_id,
        listing_title: d.listing?.title ?? 'Unknown listing',
      }))
    );
    setLoading(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.close}>Done</Text>
          </TouchableOpacity>
          <Text style={s.title}>Messages</Text>
          <View style={{ width: 44 }} />
        </View>

        {loading ? (
          <ActivityIndicator color={c.blush} style={{ flex: 1 }} />
        ) : convs.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>💬</Text>
            <Text style={s.emptyText}>No messages yet</Text>
          </View>
        ) : (
          <ScrollView>
            {convs.map(conv => {
              const isSeller = conv.seller_id === currentUserId;
              return (
                <TouchableOpacity
                  key={conv.id}
                  style={s.row}
                  onPress={() => { onClose(); onOpenConv(conv); }}
                  activeOpacity={0.7}
                >
                  <View style={s.rowIcon}>
                    <Text style={{ fontSize: 22 }}>💬</Text>
                  </View>
                  <View style={s.rowText}>
                    <Text style={s.rowTitle} numberOfLines={1}>{conv.listing_title}</Text>
                    <Text style={s.rowRole}>{isSeller ? 'You are selling' : 'You are buying'}</Text>
                  </View>
                  <Text style={s.rowChevron}>›</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const inboxSt = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.card,
    },
    close:  { fontSize: 16, fontWeight: '700', color: c.textSecondary },
    title:  { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    empty:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyEmoji: { fontSize: 40 },
    emptyText:  { fontSize: 16, color: c.textMuted, fontWeight: '600' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.card,
      gap: 14,
    },
    rowIcon:    { width: 44, height: 44, backgroundColor: c.cardLavender, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    rowText:    { flex: 1 },
    rowTitle:   { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    rowRole:    { fontSize: 13, color: c.textMuted, fontWeight: '500', marginTop: 2 },
    rowChevron: { fontSize: 22, color: c.textMuted },
  });

// ─── PostModal ────────────────────────────────────────────────────────────────

function PostModal({
  visible,
  currentUserId,
  onClose,
  onPosted,
  c,
}: {
  visible: boolean;
  currentUserId: string;
  onClose: () => void;
  onPosted: (listing: Listing) => void;
  c: ReturnType<typeof useColors>;
}) {
  const [title, setTitle]       = useState('');
  const [desc, setDesc]         = useState('');
  const [price, setPrice]       = useState('');
  const [priceType, setPriceType] = useState<PriceType>('fixed');
  const [category, setCategory] = useState('clothing');
  const [condition, setCondition] = useState<Condition>('good');
  const [city, setCity]         = useState('');
  const [stateVal, setStateVal] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [blockedContent, setBlockedContent] = useState<{ severity: 'high' | 'extreme'; reason: string } | null>(null);
  const s = postSt(c);

  const reset = () => {
    setTitle(''); setDesc(''); setPrice(''); setPriceType('fixed');
    setCategory('clothing'); setCondition('good'); setCity('');
    setStateVal(''); setImageUri(null);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library in settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setModerating(true);
      const modResult = await moderateImage(uri);
      setModerating(false);
      if (modResult.blocked) {
        setBlockedContent({ severity: modResult.severity, reason: modResult.reason });
        return;
      }
      setImageUri(uri);
    }
  };

  const submit = async () => {
    if (!title.trim()) return;
    setUploading(true);
    try {
      let imageUrl: string | null = null;
      if (imageUri) {
        imageUrl = await uploadImage(imageUri, currentUserId);
      }

      const priceNum = priceType === 'free' ? null : (parseFloat(price) || null);
      const { data, error } = await supabase
        .from('marketplace_listings')
        .insert({
          user_id: currentUserId,
          title: title.trim(),
          description: desc.trim() || null,
          price: priceNum,
          price_type: priceType,
          category,
          condition,
          city: city.trim() || null,
          state_name: stateVal.trim() || null,
          image_url: imageUrl,
          is_sold: false,
        })
        .select()
        .single();

      if (error) throw error;
      reset();
      onClose();
      onPosted(data as Listing);
    } catch {
      Alert.alert('Error', 'Could not post listing. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = title.trim().length > 0 && (priceType === 'free' || price.length > 0);

  return (
    <>
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <SafeAreaView style={s.container}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Text style={s.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>Post a Listing</Text>
            <TouchableOpacity onPress={submit} disabled={!canSubmit || uploading}>
              <Text style={[s.postBtn, (!canSubmit || uploading) && s.postBtnDisabled]}>
                {uploading ? '...' : 'Post'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {/* Photo */}
            <TouchableOpacity style={s.photoPicker} onPress={pickImage} activeOpacity={0.8}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={s.photoPreview} resizeMode="cover" />
              ) : (
                <View style={s.photoPlaceholder}>
                  <Text style={{ fontSize: 28 }}>📷</Text>
                  <Text style={s.photoLabel}>Add a photo</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Title */}
            <Text style={s.label}>Title *</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. UPPAbaby Cruz stroller, navy"
              placeholderTextColor={c.textMuted}
              value={title}
              onChangeText={setTitle}
            />

            {/* Category */}
            <Text style={s.label}>Category *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={s.chipRow}>
              {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[s.chip, category === cat.id && s.chipActive]}
                  onPress={() => setCategory(cat.id)}
                >
                  <Text style={[s.chipText, category === cat.id && s.chipTextActive]}>
                    {cat.emoji} {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Condition */}
            <Text style={s.label}>Condition *</Text>
            <View style={s.chipRow2}>
              {CONDITIONS.map(cond => (
                <TouchableOpacity
                  key={cond.id}
                  style={[s.chip, condition === cond.id && s.chipActive, { flex: 1 }]}
                  onPress={() => setCondition(cond.id)}
                >
                  <Text style={[s.chipText, condition === cond.id && s.chipTextActive]}>{cond.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Price type */}
            <Text style={s.label}>Pricing *</Text>
            <View style={s.chipRow2}>
              {PRICE_TYPES.map(pt => (
                <TouchableOpacity
                  key={pt.id}
                  style={[s.chip, priceType === pt.id && s.chipActive, { flex: 1 }]}
                  onPress={() => setPriceType(pt.id)}
                >
                  <Text style={[s.chipText, priceType === pt.id && s.chipTextActive]}>{pt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Price amount */}
            {priceType !== 'free' && (
              <>
                <Text style={s.label}>Price ($) *</Text>
                <TextInput
                  style={s.input}
                  placeholder="0.00"
                  placeholderTextColor={c.textMuted}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                />
              </>
            )}

            {/* Description */}
            <Text style={s.label}>Description</Text>
            <TextInput
              style={[s.input, s.textarea]}
              placeholder="Condition details, age, brand, why you're selling..."
              placeholderTextColor={c.textMuted}
              value={desc}
              onChangeText={setDesc}
              multiline
              textAlignVertical="top"
            />

            {/* Location */}
            <Text style={s.label}>City</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Austin"
              placeholderTextColor={c.textMuted}
              value={city}
              onChangeText={setCity}
            />
            <Text style={s.label}>State</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. TX"
              placeholderTextColor={c.textMuted}
              value={stateVal}
              onChangeText={setStateVal}
              autoCapitalize="characters"
            />

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>

    {blockedContent && (
      <ContentBlockedModal
        visible={!!blockedContent}
        severity={blockedContent.severity}
        reason={blockedContent.reason}
        contentType="listing_photo"
        userId={currentUserId}
        onClose={() => setBlockedContent(null)}
      />
    )}

    {moderating && (
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', gap: 12,
      }}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Checking photo…</Text>
      </View>
    )}
    </>
  );
}

const postSt = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.card,
    },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    cancel:      { fontSize: 15, fontWeight: '600', color: c.textSecondary },
    postBtn:     { fontSize: 15, fontWeight: '700', color: c.blush },
    postBtnDisabled: { opacity: 0.4 },
    body:        { padding: 20, gap: 6 },
    photoPicker: { borderRadius: 14, overflow: 'hidden', marginBottom: 8 },
    photoPreview: { width: '100%', height: 200 },
    photoPlaceholder: {
      width: '100%',
      height: 140,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: c.cardLavender,
      borderStyle: 'dashed',
    },
    photoLabel: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    label: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginTop: 10 },
    input: {
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 14,
      fontSize: 15,
      color: c.textPrimary,
      fontWeight: '500',
    },
    textarea:  { height: 100 },
    chipRow:   { gap: 8, paddingVertical: 4 },
    chipRow2:  { flexDirection: 'row', gap: 8 },
    chip: {
      backgroundColor: c.card,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      alignItems: 'center',
    },
    chipActive:     { backgroundColor: c.blush },
    chipText:       { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    chipTextActive: { color: '#fff', fontWeight: '700' },
  });

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ParentMarketplace({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const s = mainSt(c);

  const [listings, setListings]             = useState<Listing[]>([]);
  const [loading, setLoading]               = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [cityFilter, setCityFilter]         = useState('');
  const [showMine, setShowMine]             = useState(false);
  const [currentUserId, setCurrentUserId]   = useState('');

  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [convListing, setConvListing]          = useState<Listing | null>(null);
  const [activeConvId, setActiveConvId]        = useState<string | null>(null);
  const [activeConvTitle, setActiveConvTitle]  = useState('');
  const [inboxConv, setInboxConv]              = useState<Conversation | null>(null);
  const [showPost, setShowPost]                = useState(false);
  const [showInbox, setShowInbox]              = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    })();
    fetchListings();
  }, []);

  const fetchListings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('marketplace_listings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setListings(data ?? []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return listings.filter(l => {
      if (showMine && l.user_id !== currentUserId) return false;
      if (categoryFilter !== 'all' && l.category !== categoryFilter) return false;
      if (cityFilter.trim()) {
        const q = cityFilter.toLowerCase();
        const match =
          l.city?.toLowerCase().includes(q) ||
          l.state_name?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [listings, showMine, categoryFilter, cityFilter, currentUserId]);

  const markSold = async (id: string) => {
    await supabase.from('marketplace_listings').update({ is_sold: true }).eq('id', id);
    setListings(prev => prev.map(l => l.id === id ? { ...l, is_sold: true } : l));
  };

  const openMessage = async (listing: Listing) => {
    setSelectedListing(null);
    // Find or create conversation
    const { data: existing } = await supabase
      .from('marketplace_conversations')
      .select('id')
      .eq('listing_id', listing.id)
      .eq('buyer_id', currentUserId)
      .maybeSingle();

    let convId = existing?.id ?? null;
    if (!convId) {
      const { data: created } = await supabase
        .from('marketplace_conversations')
        .insert({
          listing_id: listing.id,
          buyer_id: currentUserId,
          seller_id: listing.user_id,
        })
        .select('id')
        .single();
      convId = created?.id ?? null;
    }
    if (convId) {
      setActiveConvId(convId);
      setActiveConvTitle(listing.title);
    }
  };

  const openInboxConv = (conv: Conversation) => {
    setActiveConvId(conv.id);
    setActiveConvTitle(conv.listing_title ?? 'Listing');
  };

  // Build grid rows
  const rows: Listing[][] = [];
  for (let i = 0; i < filtered.length; i += 2) {
    rows.push(filtered.slice(i, i + 2));
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.inboxBtn} onPress={() => setShowInbox(true)}>
            <Text style={s.inboxBtnText}>💬</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.postBtn} onPress={() => setShowPost(true)}>
            <Text style={s.postBtnText}>+ Post</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={s.pageTitle}>Parent Marketplace</Text>
        <Text style={s.pageSub}>Gently used baby & kid items from parents near you</Text>

        {/* City search */}
        <View style={s.searchWrap}>
          <Text style={s.searchIcon}>📍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Filter by city or state..."
            placeholderTextColor={c.textMuted}
            value={cityFilter}
            onChangeText={setCityFilter}
            clearButtonMode="while-editing"
          />
        </View>

        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={s.chips}>
          {CATEGORIES.map(cat => {
            const active = categoryFilter === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[s.chip, active && s.chipActive]}
                onPress={() => setCategoryFilter(cat.id)}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>
                  {cat.emoji} {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Mine toggle */}
        <TouchableOpacity
          style={[s.mineToggle, showMine && s.mineToggleActive]}
          onPress={() => setShowMine(p => !p)}
        >
          <Text style={[s.mineToggleText, showMine && s.mineToggleTextActive]}>
            {showMine ? '✓ My Listings' : 'My Listings'}
          </Text>
        </TouchableOpacity>

        {/* Grid */}
        {loading ? (
          <ActivityIndicator color={c.blush} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🛍️</Text>
            <Text style={s.emptyTitle}>No listings yet</Text>
            <Text style={s.emptyText}>
              {showMine
                ? "You haven't posted anything yet."
                : cityFilter
                  ? `No listings in "${cityFilter}" yet.`
                  : 'Be the first to post something!'}
            </Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => setShowPost(true)}>
              <Text style={s.emptyBtnText}>+ Post a Listing</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.grid}>
            {rows.map((row, i) => (
              <View key={i} style={s.row}>
                {row.map(listing => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    onPress={() => setSelectedListing(listing)}
                    c={c}
                  />
                ))}
                {row.length === 1 && <View style={{ width: CARD_W }} />}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modals */}
      <DetailModal
        listing={selectedListing}
        currentUserId={currentUserId}
        onClose={() => setSelectedListing(null)}
        onMessage={openMessage}
        onMarkSold={markSold}
        c={c}
      />

      <ConversationModal
        visible={!!activeConvId}
        conversationId={activeConvId}
        listingTitle={activeConvTitle}
        currentUserId={currentUserId}
        onClose={() => {
          setActiveConvId(null);
          setActiveConvTitle('');
          if (inboxConv) {
            setInboxConv(null);
            setShowInbox(true);
          }
        }}
        c={c}
      />

      <InboxModal
        visible={showInbox}
        currentUserId={currentUserId}
        onOpenConv={conv => {
          setInboxConv(conv);
          setShowInbox(false);
          openInboxConv(conv);
        }}
        onClose={() => setShowInbox(false)}
        c={c}
      />

      <PostModal
        visible={showPost}
        currentUserId={currentUserId}
        onClose={() => setShowPost(false)}
        onPosted={listing => setListings(prev => [listing, ...prev])}
        c={c}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mainSt = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 4,
    },
    backBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow: { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
    backLabel: { fontSize: 15, color: c.textSecondary, fontWeight: '700' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    inboxBtn:    { padding: 6 },
    inboxBtnText: { fontSize: 22 },
    postBtn: {
      backgroundColor: c.blush,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 7,
    },
    postBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    scroll:   { padding: 20, paddingBottom: 40 },
    pageTitle: { fontSize: 26, fontWeight: '800', color: c.textPrimary, marginBottom: 4 },
    pageSub:   { fontSize: 14, color: c.textMuted, fontWeight: '500', lineHeight: 20, marginBottom: 16 },

    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 12,
      paddingHorizontal: 12,
      marginBottom: 12,
      gap: 8,
    },
    searchIcon:  { fontSize: 16 },
    searchInput: { flex: 1, height: 42, fontSize: 15, color: c.textPrimary, fontWeight: '500' },

    chips: { gap: 8, paddingBottom: 12 },
    chip: {
      backgroundColor: c.card,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    chipActive:     { backgroundColor: c.blush },
    chipText:       { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    chipTextActive: { color: '#fff', fontWeight: '700' },

    mineToggle: {
      alignSelf: 'flex-start',
      backgroundColor: c.card,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 7,
      marginBottom: 16,
    },
    mineToggleActive:     { backgroundColor: c.cardLavender, borderWidth: 1.5, borderColor: c.lavender },
    mineToggleText:       { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    mineToggleTextActive: { color: c.textPrimary, fontWeight: '700' },

    grid: { gap: 12 },
    row:  { flexDirection: 'row', gap: 12 },

    empty:     { alignItems: 'center', paddingVertical: 48, gap: 10 },
    emptyEmoji: { fontSize: 44 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    emptyText:  { fontSize: 14, color: c.textMuted, fontWeight: '500', textAlign: 'center' },
    emptyBtn: {
      marginTop: 6,
      backgroundColor: c.blush,
      borderRadius: 20,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  });
