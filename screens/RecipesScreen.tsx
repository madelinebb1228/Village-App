import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Modal, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecipeCategory = 'wic' | 'weaning';
type SortMode = 'top' | 'new' | 'saved';

interface Recipe {
  id: string;
  user_id: string;
  author: string;
  title: string;
  description: string | null;
  category: RecipeCategory;
  ingredients: string;
  instructions: string;
  upvote_count: number;
  created_at: string;
}

// ─── Category meta ────────────────────────────────────────────────────────────

const CATEGORY_META: Record<RecipeCategory, { emoji: string; title: string; banner: string }> = {
  wic: {
    emoji: '🧡',
    title: 'WIC Recipes',
    banner: 'Recipes made with WIC-eligible foods — milk, eggs, whole grains, beans, fruits, veggies, and more.',
  },
  weaning: {
    emoji: '🥣',
    title: 'Weaning Recipes',
    banner: 'First-food recipes for babies 4–12+ months — purees, soft mashes, and early finger foods.',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)  return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ingredientLines(raw: string): string[] {
  return raw.split('\n').map(l => l.trim()).filter(Boolean);
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({
  recipe, userId,
  upvoted, saved,
  onUpvote, onSave, onDelete, onClose,
}: {
  recipe: Recipe; userId: string | null;
  upvoted: boolean; saved: boolean;
  onUpvote: () => void; onSave: () => void;
  onDelete: () => void; onClose: () => void;
}) {
  const c = useColors();
  const s = detailStyles(c);
  const isOwn = userId === recipe.user_id;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.close}>✕</Text>
          </TouchableOpacity>
          {isOwn && (
            <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.deleteBtn}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          <Text style={s.title}>{recipe.title}</Text>
          <Text style={s.meta}>by {recipe.author} · {timeAgo(recipe.created_at)}</Text>

          {recipe.description ? (
            <Text style={s.description}>{recipe.description}</Text>
          ) : null}

          <Text style={s.sectionLabel}>Ingredients</Text>
          <View style={s.ingredientList}>
            {ingredientLines(recipe.ingredients).map((line, i) => (
              <View key={i} style={s.ingredientRow}>
                <Text style={s.bullet}>•</Text>
                <Text style={s.ingredientText}>{line}</Text>
              </View>
            ))}
          </View>

          <Text style={s.sectionLabel}>Instructions</Text>
          <Text style={s.instructions}>{recipe.instructions}</Text>
        </ScrollView>

        {/* Action bar */}
        <View style={s.actionBar}>
          <TouchableOpacity style={[s.actionBtn, upvoted && s.actionBtnActive]} onPress={onUpvote} activeOpacity={0.75}>
            <Text style={[s.actionIcon, upvoted && s.actionIconActive]}>▲</Text>
            <Text style={[s.actionCount, upvoted && s.actionCountActive]}>{recipe.upvote_count}</Text>
            <Text style={[s.actionLabel, upvoted && s.actionLabelActive]}>{upvoted ? 'Upvoted' : 'Upvote'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, saved && s.actionBtnSaved]} onPress={onSave} activeOpacity={0.75}>
            <Text style={[s.actionIcon, saved && s.actionIconSaved]}>{saved ? '🔖' : '🔖'}</Text>
            <Text style={[s.actionLabel, saved && s.actionLabelSaved]}>{saved ? 'Saved' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Post modal ───────────────────────────────────────────────────────────────

function PostModal({
  category, onPost, onClose,
}: {
  category: RecipeCategory; onPost: (r: Recipe) => void; onClose: () => void;
}) {
  const c = useColors();
  const s = postStyles(c);
  const [title,        setTitle]        = useState('');
  const [description,  setDescription]  = useState('');
  const [ingredients,  setIngredients]  = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving,       setSaving]       = useState(false);

  async function submit() {
    if (!title.trim())        { Alert.alert('Title required'); return; }
    if (!ingredients.trim())  { Alert.alert('Ingredients required'); return; }
    if (!instructions.trim()) { Alert.alert('Instructions required'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); Alert.alert('Sign in required'); return; }

    const { data: profile } = await supabase
      .from('profiles').select('display_name, username').eq('id', user.id).single();
    const author = profile?.display_name || profile?.username || 'Anonymous';

    const { data, error } = await supabase.from('recipes').insert({
      user_id: user.id,
      author,
      title: title.trim(),
      description: description.trim() || null,
      category,
      ingredients: ingredients.trim(),
      instructions: instructions.trim(),
      upvote_count: 0,
    }).select().single();

    setSaving(false);
    if (error) { Alert.alert('Could not post', error.message); return; }
    onPost(data as Recipe);
  }

  const wicHint = category === 'wic'
    ? 'Tip: Use WIC-eligible ingredients — milk, eggs, whole grains, beans, fruits, veggies, canned fish.'
    : 'Tip: Label the age appropriateness (e.g. "6+ months") and texture (puree / soft / finger food).';

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Post a Recipe</Text>
          <TouchableOpacity onPress={submit} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            {saving ? <ActivityIndicator size="small" color={c.primary} /> : <Text style={s.post}>Post</Text>}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <View style={s.hint}>
              <Text style={s.hintText}>{wicHint}</Text>
            </View>

            <Text style={s.label}>Recipe title *</Text>
            <TextInput
              style={s.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Banana Oat Mash"
              placeholderTextColor={c.textMuted}
              returnKeyType="next"
            />

            <Text style={s.label}>Short description (optional)</Text>
            <TextInput
              style={s.input}
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. 6+ months · quick · freezer-friendly"
              placeholderTextColor={c.textMuted}
              returnKeyType="next"
            />

            <Text style={s.label}>Ingredients * <Text style={s.sublabel}>(one per line)</Text></Text>
            <TextInput
              style={[s.input, s.multiInput]}
              value={ingredients}
              onChangeText={setIngredients}
              placeholder={"1 ripe banana\n1/2 cup rolled oats\n1/4 cup breast milk or formula"}
              placeholderTextColor={c.textMuted}
              multiline
              textAlignVertical="top"
            />

            <Text style={s.label}>Instructions *</Text>
            <TextInput
              style={[s.input, s.multiInput, { minHeight: 120 }]}
              value={instructions}
              onChangeText={setInstructions}
              placeholder={"1. Cook oats with water until soft.\n2. Mash banana and stir into oats.\n3. Add milk to reach desired consistency."}
              placeholderTextColor={c.textMuted}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Recipe card ──────────────────────────────────────────────────────────────

function RecipeCard({
  recipe, upvoted, saved, onPress,
}: {
  recipe: Recipe; upvoted: boolean; saved: boolean; onPress: () => void;
}) {
  const c = useColors();
  const s = cardStyles(c);
  const lineCount = ingredientLines(recipe.ingredients).length;

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.8}>
      <View style={s.cardTop}>
        <View style={s.cardBody}>
          <Text style={s.cardTitle} numberOfLines={2}>{recipe.title}</Text>
          {recipe.description ? (
            <Text style={s.cardDesc} numberOfLines={1}>{recipe.description}</Text>
          ) : null}
          <Text style={s.cardMeta}>
            by {recipe.author} · {lineCount} ingredient{lineCount !== 1 ? 's' : ''} · {timeAgo(recipe.created_at)}
          </Text>
        </View>
        {saved && <Text style={s.savedBadge}>🔖</Text>}
      </View>
      <View style={s.cardFooter}>
        <View style={[s.upvoteChip, upvoted && s.upvoteChipActive]}>
          <Text style={[s.upvoteArrow, upvoted && s.upvoteArrowActive]}>▲</Text>
          <Text style={[s.upvoteCount, upvoted && s.upvoteCountActive]}>{recipe.upvote_count}</Text>
        </View>
        <Text style={s.tapHint}>Tap to view full recipe →</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RecipesScreen({
  category, onBack,
}: {
  category: RecipeCategory; onBack: () => void;
}) {
  const c = useColors();
  const s = styles(c);
  const meta = CATEGORY_META[category];

  const [userId,     setUserId]     = useState<string | null>(null);
  const [recipes,    setRecipes]    = useState<Recipe[]>([]);
  const [upvotedIds, setUpvotedIds] = useState<Set<string>>(new Set());
  const [savedIds,   setSavedIds]   = useState<Set<string>>(new Set());
  const [loading,    setLoading]    = useState(true);
  const [sortMode,   setSortMode]   = useState<SortMode>('top');
  const [query,      setQuery]      = useState('');
  const [detail,     setDetail]     = useState<Recipe | null>(null);
  const [showPost,   setShowPost]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setUserId(user.id);

    const [recipesRes, upvotesRes, savesRes] = await Promise.all([
      supabase.from('recipes').select('*').eq('category', category).order('upvote_count', { ascending: false }),
      user ? supabase.from('recipe_upvotes').select('recipe_id').eq('user_id', user.id) : Promise.resolve({ data: [] }),
      user ? supabase.from('saved_recipes').select('recipe_id').eq('user_id', user.id) : Promise.resolve({ data: [] }),
    ]);

    if (recipesRes.data) setRecipes(recipesRes.data as Recipe[]);
    if (upvotesRes.data) setUpvotedIds(new Set((upvotesRes.data as any[]).map(r => r.recipe_id)));
    if (savesRes.data)   setSavedIds(new Set((savesRes.data as any[]).map(r => r.recipe_id)));
    setLoading(false);
  }, [category]);

  useEffect(() => { load(); }, [load]);

  // ── Upvote ────────────────────────────────────────────────────────────────

  async function toggleUpvote(recipe: Recipe) {
    if (!userId) { Alert.alert('Sign in to upvote'); return; }
    const isUpvoted = upvotedIds.has(recipe.id);
    const delta = isUpvoted ? -1 : 1;

    // Optimistic update
    setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, upvote_count: r.upvote_count + delta } : r));
    setUpvotedIds(prev => {
      const next = new Set(prev);
      isUpvoted ? next.delete(recipe.id) : next.add(recipe.id);
      return next;
    });
    if (detail?.id === recipe.id) setDetail(d => d ? { ...d, upvote_count: d.upvote_count + delta } : d);

    if (isUpvoted) {
      await supabase.from('recipe_upvotes').delete().eq('recipe_id', recipe.id).eq('user_id', userId);
      await supabase.from('recipes').update({ upvote_count: Math.max(0, recipe.upvote_count - 1) }).eq('id', recipe.id);
    } else {
      await supabase.from('recipe_upvotes').insert({ recipe_id: recipe.id, user_id: userId });
      await supabase.from('recipes').update({ upvote_count: recipe.upvote_count + 1 }).eq('id', recipe.id);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function toggleSave(recipe: Recipe) {
    if (!userId) { Alert.alert('Sign in to save'); return; }
    const isSaved = savedIds.has(recipe.id);
    setSavedIds(prev => {
      const next = new Set(prev);
      isSaved ? next.delete(recipe.id) : next.add(recipe.id);
      return next;
    });
    if (isSaved) {
      await supabase.from('saved_recipes').delete().eq('recipe_id', recipe.id).eq('user_id', userId);
    } else {
      await supabase.from('saved_recipes').insert({ recipe_id: recipe.id, user_id: userId });
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  function deleteRecipe(recipe: Recipe) {
    Alert.alert('Delete recipe', `Remove "${recipe.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('recipes').delete().eq('id', recipe.id);
          setRecipes(prev => prev.filter(r => r.id !== recipe.id));
          setDetail(null);
        },
      },
    ]);
  }

  // ── Sorted / filtered list ────────────────────────────────────────────────

  const displayed = (() => {
    let list = [...recipes];
    if (sortMode === 'saved') list = list.filter(r => savedIds.has(r.id));
    if (query.trim()) {
      const terms = query.toLowerCase().trim().split(/\s+/);
      list = list.filter(r => {
        const haystack = (r.title + ' ' + r.ingredients + ' ' + (r.description ?? '')).toLowerCase();
        return terms.every(t => haystack.includes(t));
      });
    }
    if (sortMode === 'top') list.sort((a, b) => b.upvote_count - a.upvote_count || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sortMode === 'new') list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list;
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.pageTitle}>{meta.emoji} {meta.title}</Text>

        {/* Info banner */}
        <View style={s.banner}>
          <Text style={s.bannerText}>{meta.banner}</Text>
        </View>

        {/* Sort tabs */}
        <View style={s.sortRow}>
          {(['top', 'new', 'saved'] as SortMode[]).map(mode => (
            <TouchableOpacity
              key={mode}
              style={[s.sortChip, sortMode === mode && s.sortChipActive]}
              onPress={() => setSortMode(mode)}
              activeOpacity={0.75}
            >
              <Text style={[s.sortLabel, sortMode === mode && s.sortLabelActive]}>
                {mode === 'top' ? '▲ Top' : mode === 'new' ? '✦ New' : '🔖 Saved'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search */}
        <View style={s.searchRow}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by ingredient, title…"
            placeholderTextColor={c.textMuted}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* List */}
        {loading ? (
          <ActivityIndicator color={c.primary} style={{ marginTop: 40 }} />
        ) : displayed.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>{query ? '🔍' : sortMode === 'saved' ? '🔖' : meta.emoji}</Text>
            <Text style={s.emptyTitle}>
              {query ? 'No matches' : sortMode === 'saved' ? 'No saved recipes yet' : 'No recipes yet'}
            </Text>
            <Text style={s.emptyBody}>
              {query
                ? `No recipes found with "${query}". Try a different ingredient or clear the search.`
                : sortMode === 'saved'
                  ? 'Tap 🔖 on any recipe to save it here.'
                  : 'Be the first to share a recipe with the village!'}
            </Text>
          </View>
        ) : (
          displayed.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              upvoted={upvotedIds.has(recipe.id)}
              saved={savedIds.has(recipe.id)}
              onPress={() => setDetail(recipe)}
            />
          ))
        )}

        {/* Post CTA */}
        {!loading && (
          <TouchableOpacity style={s.postBtn} onPress={() => setShowPost(true)} activeOpacity={0.8}>
            <Text style={s.postBtnText}>+ Share a recipe</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Modals */}
      {detail && (
        <DetailModal
          recipe={detail}
          userId={userId}
          upvoted={upvotedIds.has(detail.id)}
          saved={savedIds.has(detail.id)}
          onUpvote={() => toggleUpvote(detail)}
          onSave={() => toggleSave(detail)}
          onDelete={() => deleteRecipe(detail)}
          onClose={() => setDetail(null)}
        />
      )}

      {showPost && (
        <PostModal
          category={category}
          onPost={recipe => { setRecipes(prev => [recipe, ...prev]); setShowPost(false); setDetail(recipe); }}
          onClose={() => setShowPost(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow: { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
    backLabel: { fontSize: 15, color: c.textSecondary, fontWeight: '700' },
    scroll: { padding: 20, paddingBottom: 48 },
    pageTitle: { fontSize: 26, fontWeight: '800', color: c.textPrimary, marginBottom: 12 },

    banner: { backgroundColor: c.cardHoney, borderRadius: 12, padding: 14, marginBottom: 18 },
    bannerText: { fontSize: 13, color: c.honey, fontWeight: '600', lineHeight: 19 },

    sortRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    sortChip: {
      flex: 1, paddingVertical: 9, borderRadius: 20,
      borderWidth: 1.5, borderColor: c.separator,
      backgroundColor: c.card, alignItems: 'center',
    },
    sortChipActive: { borderColor: c.primary, backgroundColor: c.cardLavender },
    sortLabel: { fontSize: 13, fontWeight: '700', color: c.textMuted },
    sortLabelActive: { color: c.primary },

    empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
    emptyEmoji: { fontSize: 44 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    emptyBody: { fontSize: 14, color: c.textMuted, fontWeight: '500', textAlign: 'center', lineHeight: 20 },

    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1,
      borderColor: c.separator, paddingHorizontal: 12, paddingVertical: 10,
      marginBottom: 16,
    },
    searchIcon: { fontSize: 15 },
    searchInput: { flex: 1, fontSize: 15, color: c.textPrimary, fontWeight: '500' },
    searchClear: { fontSize: 14, color: c.textMuted, fontWeight: '700' },

    postBtn: {
      marginTop: 16, borderWidth: 1.5, borderColor: c.primary, borderStyle: 'dashed',
      borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    },
    postBtnText: { fontSize: 15, fontWeight: '800', color: c.primary },
  });

const cardStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card, borderRadius: 16, borderWidth: 1,
      borderColor: c.separator, padding: 16, marginBottom: 12, gap: 12,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    cardBody: { flex: 1, gap: 3 },
    cardTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    cardDesc: { fontSize: 13, color: c.textSecondary, fontWeight: '500' },
    cardMeta: { fontSize: 12, color: c.textMuted, fontWeight: '500', marginTop: 2 },
    savedBadge: { fontSize: 18 },
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    upvoteChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      borderWidth: 1.5, borderColor: c.separator, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.bgAlt,
    },
    upvoteChipActive: { borderColor: c.sage, backgroundColor: '#D1FAE5' },
    upvoteArrow: { fontSize: 12, color: c.textMuted, fontWeight: '800' },
    upvoteArrowActive: { color: c.sage },
    upvoteCount: { fontSize: 13, fontWeight: '800', color: c.textMuted },
    upvoteCountActive: { color: c.sage },
    tapHint: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
  });

const detailStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    close: { fontSize: 18, color: c.textMuted, fontWeight: '700' },
    deleteBtn: { fontSize: 15, color: '#EF4444', fontWeight: '700' },
    body: { padding: 24, paddingBottom: 12, gap: 4 },
    title: { fontSize: 22, fontWeight: '800', color: c.textPrimary, marginBottom: 4 },
    meta: { fontSize: 13, color: c.textMuted, fontWeight: '500', marginBottom: 8 },
    description: { fontSize: 14, color: c.textSecondary, fontWeight: '500', lineHeight: 20, marginBottom: 8 },
    sectionLabel: { fontSize: 13, fontWeight: '800', color: c.textMuted, marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
    ingredientList: { gap: 6 },
    ingredientRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    bullet: { fontSize: 14, color: c.primary, fontWeight: '800', lineHeight: 22 },
    ingredientText: { flex: 1, fontSize: 15, color: c.textPrimary, fontWeight: '500', lineHeight: 22 },
    instructions: { fontSize: 15, color: c.textPrimary, fontWeight: '500', lineHeight: 24 },
    actionBar: {
      flexDirection: 'row', gap: 12, padding: 16,
      borderTopWidth: 1, borderTopColor: c.separator,
    },
    actionBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 12, borderRadius: 14,
      backgroundColor: c.bgAlt, borderWidth: 1.5, borderColor: c.separator,
    },
    actionBtnActive: { backgroundColor: '#D1FAE5', borderColor: c.sage },
    actionBtnSaved:  { backgroundColor: c.cardHoney, borderColor: c.honey },
    actionIcon: { fontSize: 14, color: c.textMuted, fontWeight: '800' },
    actionIconActive: { color: c.sage },
    actionIconSaved:  { color: c.honey },
    actionCount: { fontSize: 15, fontWeight: '800', color: c.textMuted },
    actionCountActive: { color: c.sage },
    actionLabel: { fontSize: 14, fontWeight: '700', color: c.textMuted },
    actionLabelActive: { color: c.sage },
    actionLabelSaved: { color: c.honey },
  });

const postStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    cancel: { fontSize: 16, color: c.textMuted, fontWeight: '600' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    post: { fontSize: 16, color: c.primary, fontWeight: '800' },
    body: { padding: 20, gap: 8, paddingBottom: 48 },
    hint: { backgroundColor: c.cardSage, borderRadius: 12, padding: 12, marginBottom: 8 },
    hintText: { fontSize: 13, color: c.sage, fontWeight: '600', lineHeight: 18 },
    label: { fontSize: 13, fontWeight: '800', color: c.textMuted, marginTop: 6 },
    sublabel: { fontWeight: '500', color: c.textMuted },
    input: {
      backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1,
      borderColor: c.inputBorder, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: c.textPrimary, fontWeight: '500',
    },
    multiInput: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  });
