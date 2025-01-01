import { PublicEventHandler } from '../../util/events.js';
import type { Packet } from '../../util/packet.js';
import type { AsyncVoid } from '../../util/types.js';
import proxy from '../internal.proxy/local.js';

export interface PartialPlayer {
  uuid: string;
  player?: {
    name: string;
    properties: { key: string; value: string; signature: string }[];
  };
  // TODO: chatSession
  chatSession?: undefined;
  gamemode?: number;
  listed?: boolean;
  latency?: number;
  displayName?: string;
}

interface DownstreamPlayerInfoPacketData {
  action: number;
  data: PartialPlayer[];
}

interface DownstreamPlayerRemovePacketData {
  players: string[];
}

export interface EventMap {
  /**
   * @param delta reference to the packet's delta, changes will be reflected on client
   */
  'player.update': (player: PartialPlayer, delta: PartialPlayer) => AsyncVoid;
  'player.join': (player: PartialPlayer) => AsyncVoid;
  'player.leave': (uuid: string) => AsyncVoid;
}

class PDTPlugin extends PublicEventHandler<EventMap> {
  public getPlayerByUUID(uuid: string): PartialPlayer | undefined {
    return players.get(uuid);
  }

  public getPlayers(): IterableIterator<PartialPlayer> {
    return players.values();
  }

  public getPlayerArray(): PartialPlayer[] {
    return Array.from(this.getPlayers());
  }
}

export const pdt = new PDTPlugin();

export default pdt;

const players = new Map<string, PartialPlayer>();

proxy.downstream.on(
  'player_info',
  async (packet: Packet<DownstreamPlayerInfoPacketData>) => {
    for (const delta of packet.data.data) {
      const hadPlayer = players.has(delta.uuid);

      const player = players.get(delta.uuid) ?? ({} as PartialPlayer);
      players.set(delta.uuid, player);

      for (const [key, value] of Object.entries(delta)) {
        if (value === undefined) continue;

        // why can't ts be just a little bit smarter
        // (I even tried making Object.entries return [keyof PartialPlayer, PartialPlayer[keyof PartialPlayer]] and it didn't work)
        (player as any)[key] = value;
      }

      await pdt.emit('player.update', player, delta);

      // the bitflag for having player is called add_player
      // but, when checking for it, it would also trigger
      // on latency updates
      if (!hadPlayer) await pdt.emit('player.join', player);
    }
  },
);

proxy.downstream.on(
  'player_remove',
  async (packet: Packet<DownstreamPlayerRemovePacketData>) => {
    for (const uuid of packet.data.players) {
      await pdt.emit('player.leave', uuid);

      players.delete(uuid);
    }
  },
);
