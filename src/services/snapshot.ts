import { GameState } from '@gin-rummy/common';
import { ReplayService } from './replay';
import { EventStore } from './eventStore';

const DEFAULT_INTERVAL = 25;
const DISABLED_FLAG = 'false';

const defaultForceEvents = ['GAME_STARTED', 'ROUND_ENDED', 'GAME_FINISHED'];
const configForceEvents = process.env.GAME_SNAPSHOT_FORCE_EVENTS
  ? process.env.GAME_SNAPSHOT_FORCE_EVENTS.split(',').map((value) => value.trim()).filter(Boolean)
  : [];
const FORCE_EVENT_TYPES = new Set<string>([...defaultForceEvents, ...configForceEvents]);

type SnapshotOptions = {
  force?: boolean;
  eventType?: string;
  state?: GameState;
};

function shouldCapture(sequenceNumber: number, options: SnapshotOptions): boolean {
  if (String(process.env.GAME_SNAPSHOT_ENABLED).toLowerCase() === DISABLED_FLAG) {
    return false;
  }
  const interval = Number(process.env.GAME_SNAPSHOT_INTERVAL || DEFAULT_INTERVAL);
  const normalizedInterval = Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_INTERVAL;
  const forced = options.force || (options.eventType ? FORCE_EVENT_TYPES.has(options.eventType) : false);
  if (forced) return true;
  return sequenceNumber > 0 && sequenceNumber % normalizedInterval === 0;
}

export async function maybeCaptureSnapshot(
  gameId: string,
  sequenceNumber: number,
  options: SnapshotOptions = {}
) {
  if (!shouldCapture(sequenceNumber, options)) {
    return;
  }

  try {
    const snapshotState = options.state
      ? options.state
      : (await ReplayService.rebuildState(gameId, sequenceNumber)).state;

    await EventStore.saveSnapshot(gameId, sequenceNumber, snapshotState);
  } catch (error) {
    console.error(`📸 SnapshotService: Failed to capture snapshot for game ${gameId} at ${sequenceNumber}`, error);
  }
}
