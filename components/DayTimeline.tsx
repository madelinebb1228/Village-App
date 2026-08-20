import React, { useMemo, useRef, useState, forwardRef } from 'react';
import { View, Text, TouchableOpacity, Animated, PanResponder, GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { Colors } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

// Kept intentionally narrow (a subset of SharedCalendar's CalEvent) so this
// component doesn't need to import the full type from the screen that hosts
// it — anything with these fields can be laid out on the timeline.
export interface TimedEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  is_flexible: boolean;
  recurrence_id: string | null;
  [key: string]: any;
}

export interface DayTimelineProps {
  date: string;                 // yyyy-mm-dd, local
  events: TimedEvent[];         // already filtered to is_scheduled !== false
  colors: Colors;
  minHour: number;
  maxHour: number;
  pxPerMinute?: number;
  onPressEvent: (e: TimedEvent) => void;
  onDeleteEvent: (e: TimedEvent) => void;
  onDragEnd: (e: TimedEvent, newStart: Date, newEnd: Date | null) => void;
  onDragStateChange?: (dragging: boolean) => void;
}

export interface DayTimelineHandle {
  measure: (cb: (x: number, y: number, width: number, height: number, pageX: number, pageY: number) => void) => void;
}

// ─── Pure layout helpers (exported for unit testing) ───────────────────────────

export interface TimelineBlockInput { id: string; start: Date; end: Date }
export interface ColumnLayout { col: number; cols: number }

// Classic interval-clustering + greedy column packing: events that overlap in
// time get bucketed into the same cluster, then each event in a cluster is
// assigned the first column whose previous occupant already ended.
export function layoutColumns(events: TimelineBlockInput[]): Map<string, ColumnLayout> {
  const layout = new Map<string, ColumnLayout>();
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());

  let cluster: TimelineBlockInput[] = [];
  let clusterEnd = -Infinity;

  function flushCluster() {
    if (cluster.length === 0) return;
    const columnEnds: number[] = [];
    const colOf = new Map<string, number>();
    for (const ev of cluster) {
      let placedCol = -1;
      for (let i = 0; i < columnEnds.length; i++) {
        if (columnEnds[i] <= ev.start.getTime()) { placedCol = i; break; }
      }
      if (placedCol === -1) { placedCol = columnEnds.length; columnEnds.push(ev.end.getTime()); }
      else { columnEnds[placedCol] = ev.end.getTime(); }
      colOf.set(ev.id, placedCol);
    }
    const cols = columnEnds.length;
    for (const ev of cluster) layout.set(ev.id, { col: colOf.get(ev.id)!, cols });
    cluster = [];
  }

  for (const ev of sorted) {
    if (cluster.length > 0 && ev.start.getTime() >= clusterEnd) {
      flushCluster();
      clusterEnd = -Infinity;
    }
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.end.getTime());
  }
  flushCluster();

  return layout;
}

export function topPxForDate(date: Date, minHour: number, pxPerMinute: number): number {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return (minutes - minHour * 60) * pxPerMinute;
}

export function dateAtMinutesFromWindowStart(dateKey: string, minHour: number, minutesFromStart: number): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d, minHour, 0, 0, 0);
  dt.setMinutes(dt.getMinutes() + minutesFromStart);
  return dt;
}

function formatEventTimeRange(e: TimedEvent): string {
  const start = new Date(e.starts_at);
  const startStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!e.ends_at) return startStr;
  const end = new Date(e.ends_at);
  return `${startStr} – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function formatHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_PX_PER_MINUTE = 1.2;
const MIN_BLOCK_PX = 24;
const SNAP_MIN = 15;
const TAP_THRESHOLD_PX = 6;
const HOUR_LABEL_WIDTH = 52;

// ─── Draggable block ────────────────────────────────────────────────────────

interface DraggableBlockProps {
  event: TimedEvent;
  isPoint: boolean;
  top: number;
  height: number;
  left: string;
  width: string;
  colors: Colors;
  date: string;
  minHour: number;
  pxPerMinute: number;
  containerHeight: number;
  onPressEvent: (e: TimedEvent) => void;
  onDeleteEvent: (e: TimedEvent) => void;
  onDragEnd: (e: TimedEvent, newStart: Date, newEnd: Date | null) => void;
  onDragStateChange?: (dragging: boolean) => void;
}

function DraggableBlock({
  event, isPoint, top, height, left, width, colors, date, minHour, pxPerMinute,
  containerHeight, onPressEvent, onDeleteEvent, onDragEnd, onDragStateChange,
}: DraggableBlockProps) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [dragging, setDragging] = useState(false);
  const [previewLabel, setPreviewLabel] = useState<string | null>(null);

  // Always-current snapshot the PanResponder closures read from, so a
  // PanResponder created once via useRef never sees stale props/derived values.
  const latest = useRef({ event, top, height, date, minHour, pxPerMinute, containerHeight });
  latest.current = { event, top, height, date, minHour, pxPerMinute, containerHeight };

  const snapPx = pxPerMinute * SNAP_MIN;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 2 || Math.abs(gesture.dx) > 2,
      onPanResponderGrant: () => {
        setDragging(true);
        onDragStateChange?.(true);
      },
      onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        const { top: t, minHour: mh, pxPerMinute: ppm, containerHeight: ch, height: h } = latest.current;
        const snap = ppm * SNAP_MIN;
        const rawTop = t + gesture.dy;
        const snappedTop = Math.round(rawTop / snap) * snap;
        const clampedTop = Math.max(0, Math.min(snappedTop, ch - h));
        pan.y.setValue(clampedTop - t);

        const minutesFromStart = clampedTop / ppm;
        const previewDate = dateAtMinutesFromWindowStart(latest.current.date, mh, minutesFromStart);
        setPreviewLabel(previewDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      },
      onPanResponderRelease: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        setDragging(false);
        setPreviewLabel(null);
        onDragStateChange?.(false);
        pan.setValue({ x: 0, y: 0 });

        const { event: ev, top: t, height: h, date: d, minHour: mh, pxPerMinute: ppm, containerHeight: ch } = latest.current;
        if (Math.abs(gesture.dy) < TAP_THRESHOLD_PX && Math.abs(gesture.dx) < TAP_THRESHOLD_PX) {
          onPressEvent(ev);
          return;
        }

        const snap = ppm * SNAP_MIN;
        const rawTop = t + gesture.dy;
        const finalTop = Math.max(0, Math.min(Math.round(rawTop / snap) * snap, ch - h));
        const minutesFromStart = finalTop / ppm;
        const newStart = dateAtMinutesFromWindowStart(d, mh, minutesFromStart);

        let newEnd: Date | null = null;
        if (ev.ends_at) {
          const durationMs = new Date(ev.ends_at).getTime() - new Date(ev.starts_at).getTime();
          newEnd = new Date(newStart.getTime() + durationMs);
        }
        onDragEnd(ev, newStart, newEnd);
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        setPreviewLabel(null);
        onDragStateChange?.(false);
        pan.setValue({ x: 0, y: 0 });
      },
    })
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={{
        position: 'absolute',
        top,
        left: left as any,
        width: width as any,
        height: isPoint ? undefined : height,
        transform: pan.getTranslateTransform(),
        zIndex: dragging ? 10 : 1,
      }}
    >
      {isPoint ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
          borderWidth: 1.5, borderColor: colors.primary, alignSelf: 'flex-start',
          shadowColor: dragging ? '#000' : undefined, shadowOpacity: dragging ? 0.2 : 0, shadowRadius: 6, elevation: dragging ? 4 : 0,
        }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
          <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary, maxWidth: 140 }}>
            {event.title}
          </Text>
        </View>
      ) : (
        <View style={{
          flex: 1, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1.5,
          borderColor: colors.separator, borderLeftWidth: 4, borderLeftColor: colors.primary,
          padding: 6, overflow: 'hidden',
          shadowColor: dragging ? '#000' : undefined, shadowOpacity: dragging ? 0.25 : 0, shadowRadius: 8, elevation: dragging ? 6 : 0,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Text numberOfLines={height < 40 ? 1 : 2} style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary, flex: 1, paddingRight: 4 }}>
              {event.recurrence_id ? '🔁 ' : ''}{event.is_flexible ? '🔀 ' : ''}{event.title}
            </Text>
            <TouchableOpacity onPress={() => onDeleteEvent(event)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>🗑</Text>
            </TouchableOpacity>
          </View>
          {height >= 40 ? (
            <Text style={{ fontSize: 10, color: colors.textSecondary, fontWeight: '600', marginTop: 2 }}>
              {formatEventTimeRange(event)}
            </Text>
          ) : null}
        </View>
      )}
      {dragging && previewLabel ? (
        <View style={{
          position: 'absolute', top: isPoint ? -26 : -24, left: 0,
          backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{previewLabel}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

const DayTimeline = forwardRef<DayTimelineHandle, DayTimelineProps>(function DayTimeline(
  { date, events, colors, minHour, maxHour, pxPerMinute = DEFAULT_PX_PER_MINUTE, onPressEvent, onDeleteEvent, onDragEnd, onDragStateChange },
  ref
) {
  const containerRef = useRef<View>(null);
  React.useImperativeHandle(ref, () => ({
    measure: (cb) => containerRef.current?.measure(cb as any),
  }));

  const allDayEvents = useMemo(() => events.filter(e => e.all_day), [events]);
  const timedEvents = useMemo(() => events.filter(e => !e.all_day), [events]);

  const containerHeight = Math.max(0, (maxHour - minHour) * 60 * pxPerMinute);

  const columnLayout = useMemo(() => {
    const blocks = timedEvents.map(e => {
      const start = new Date(e.starts_at);
      const end = e.ends_at ? new Date(e.ends_at) : start;
      return { id: e.id, start, end };
    });
    return layoutColumns(blocks);
  }, [timedEvents]);

  const now = new Date();
  const isToday = date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowTop = topPxForDate(now, minHour, pxPerMinute);

  const hours: number[] = [];
  for (let h = minHour; h <= maxHour; h++) hours.push(h);

  return (
    <View>
      {allDayEvents.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {allDayEvents.map(e => (
            <TouchableOpacity
              key={e.id}
              onPress={() => onPressEvent(e)}
              style={{
                backgroundColor: colors.cardLavender, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
              }}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.lavender }}>📌 {e.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {timedEvents.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 28 }}>
          <Text style={{ fontSize: 34, marginBottom: 8 }}>📅</Text>
          <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>
            Nothing scheduled. Tap “+ Event” to add something.
          </Text>
        </View>
      ) : (
        <View ref={containerRef} style={{ flexDirection: 'row', height: containerHeight }}>
          {/* Hour axis */}
          <View style={{ width: HOUR_LABEL_WIDTH }}>
            {hours.map(h => (
              <View key={h} style={{ position: 'absolute', top: topPxForDate(new Date(2000, 0, 1, h, 0), minHour, pxPerMinute) - 6 }}>
                <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '600' }}>{formatHourLabel(h)}</Text>
              </View>
            ))}
          </View>

          {/* Grid + blocks */}
          <View style={{ flex: 1, position: 'relative' }}>
            {hours.map(h => (
              <View
                key={h}
                style={{
                  position: 'absolute', left: 0, right: 0,
                  top: topPxForDate(new Date(2000, 0, 1, h, 0), minHour, pxPerMinute),
                  height: 1, backgroundColor: colors.separator,
                }}
              />
            ))}

            {isToday && nowTop >= 0 && nowTop <= containerHeight && (
              <View style={{ position: 'absolute', left: 0, right: 0, top: nowTop, height: 2, backgroundColor: colors.primary, zIndex: 5 }} />
            )}

            {timedEvents.map(e => {
              const start = new Date(e.starts_at);
              const isPoint = !e.ends_at;
              const end = e.ends_at ? new Date(e.ends_at) : start;
              const top = topPxForDate(start, minHour, pxPerMinute);
              const durationMin = Math.max(0, (end.getTime() - start.getTime()) / 60000);
              const height = Math.max(MIN_BLOCK_PX, durationMin * pxPerMinute);
              const layout = columnLayout.get(e.id) ?? { col: 0, cols: 1 };
              const widthPct = 100 / layout.cols;
              const leftPct = layout.col * widthPct;

              return (
                <DraggableBlock
                  key={e.id}
                  event={e}
                  isPoint={isPoint}
                  top={top}
                  height={height}
                  left={`${leftPct}%`}
                  width={`${widthPct}%`}
                  colors={colors}
                  date={date}
                  minHour={minHour}
                  pxPerMinute={pxPerMinute}
                  containerHeight={containerHeight}
                  onPressEvent={onPressEvent}
                  onDeleteEvent={onDeleteEvent}
                  onDragEnd={onDragEnd}
                  onDragStateChange={onDragStateChange}
                />
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
});

export default DayTimeline;
