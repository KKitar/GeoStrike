import { v4 } from 'uuid';
import { sign } from 'jsonwebtoken';
import { GameState, PlayerState, PlayerSyncState } from '../../types';
import * as Cesium from 'cesium';
import { Settings } from '../../settings/settings';
import { startClientsUpdater } from '../clients-updater/clients-updater';
import { BackgroundCharacterManager } from '../background-character/background-character-manager';

export interface ICartesian3Location {
  x: number;
  y: number;
  z: number;
}

export enum Team {
  RED = 'RED',
  BLUE = 'BLUE',
  NONE = 'NONE',
}

export enum CharacterType {
  PLAYER = 'PLAYER',
  BACKGROUND_CHARACTER = 'BACKGROUND_CHARACTER',
  OVERVIEW = 'OVERVIEW',
}

export interface IViewer {
  token: string;
  id: string;
  username: string;
}

export interface IPlayer {
  playerId: string;
  token: string;
  character: string;
  username: string;
  state: PlayerState;
  game: IGameObject;
  currentLocation: ICartesian3Location;
  heading: number;
  team: Team;
  syncState: PlayerSyncState;
  type: CharacterType;
}

export interface IGameObject {
  gameId: string;
  gameCode: string;
  playersMap: Map<string, IPlayer>;
  viewers: IViewer[];
  state: GameState;
  clientsUpdater?: any;
  bgCharactersManager: BackgroundCharacterManager;
}

const TOKENS_SECRET = 'sdf43tSWDG#%Tsdfw4';

const DEFAULT_PLAYERS_LOCATION = [
  { x: 1334783.4002701144, y: -4650320.207361281, z: 4142206.104919172 },
  { x: 1334734.4041850453, y: -4650448.021286272, z: 4142079.251574431 },
  { x: 1334743.0138112511, y: -4650448.206585243, z: 4142076.289141699 },
  { x: 1334812.4342012317, y: -4650321.075155178, z: 4142195.8438288164 },
];

export class GamesManager {
  private activeGames: Map<string, IGameObject> = new Map<
    string,
    IGameObject
  >();

  private generateGameCode(): string {
    const min = 1000;
    const max = 9999;
    let gameCode: string;

    do {
      gameCode = String(Math.floor(Math.random() * (max - min) + min));
    } while (this.activeGames.has(gameCode));

    return gameCode;
  }

  addPlayerToGame(gameId: string, player: IPlayer) {
    const game = this.getGameById(gameId);
    const playerToAdd = {
      ...player,
      game,
    } as IPlayer;

    game.playersMap.set(player.playerId, playerToAdd);

    return player;
  }

  addViewerToGame(gameId: string, username: string): IViewer {
    const game = this.getGameById(gameId);
    const playerId = v4();
    const playerToken = sign(
      {
        gameId: game.gameId,
        playerId,
        username,
      },
      TOKENS_SECRET
    );

    const viewer = {
      token: playerToken,
      id: playerId,
      username,
    };
    game.viewers.push(viewer);
    return viewer;
  }

  addRealPlayerToGame(
    gameId: string,
    character: string,
    username: string,
    team: Team
  ): IPlayer {
    const game = this.getGameById(gameId);
    const playerId = v4();
    const playerToken = sign(
      {
        gameId: game.gameId,
        playerId,
        username,
      },
      TOKENS_SECRET
    );

    const realPlayerCount = Array.from(game.playersMap.values()).filter(
      player => player.type === CharacterType.PLAYER
    ).length;
    const player: IPlayer = {
      playerId,
      character,
      token: playerToken,
      username,
      state: 'WAITING',
      game,
      currentLocation: DEFAULT_PLAYERS_LOCATION[realPlayerCount],
      heading: 0,
      team,
      type: CharacterType.PLAYER,
      syncState: 'VALID',
    };

    game.playersMap.set(playerId, player);

    return player;
  }

  createNewGame(): IGameObject {
    const gameId = v4();
    const gameCode = this.generateGameCode();

    const bgCharactersManager = new BackgroundCharacterManager(gameId, this);
    const gameObject: IGameObject = {
      gameId,
      gameCode,
      playersMap: new Map<string, IPlayer>(),
      state: 'WAITING',
      bgCharactersManager,
      viewers: [],
    };
    startClientsUpdater(gameObject);
    this.activeGames.set(gameId, gameObject);

    bgCharactersManager.initBgCharacters();
    bgCharactersManager.startCharactersMovement();

    return gameObject;
  }

  getGameById(id: string): IGameObject {
    if (this.activeGames.has(id)) {
      return this.activeGames.get(id);
    }

    throw new Error('Game does not exists');
  }

  getGameByCode(code: string): IGameObject {
    for (const [key, value] of this.activeGames.entries()) {
      if (value.gameCode === code) {
        return value;
      }
    }

    throw new Error('Game does not exists');
  }

  playerReady(gameId: string, playerId: string) {
    const game = this.getGameById(gameId);
    const player = game.playersMap.get(playerId);

    if (player) {
      player.state = 'READY';
    }
  }

  updatePlayerPosition(
    gameId: string,
    playerId: string,
    position: ICartesian3Location,
    heading: number,
    skipValidation = false
  ) {
    const game = this.getGameById(gameId);
    const player = game.playersMap.get(playerId);
    if (player && position) {
      if (
        skipValidation ||
        this.validatePlayerPosition(player.currentLocation, position)
      ) {
        player.syncState = 'VALID';
        player.currentLocation = position;
        player.heading = heading;
      } else {
        player.syncState = 'INVALID';
      }
    }
  }

  updatePlayerState(gameId: string, playerId: string, newState: PlayerState) {
    const game = this.getGameById(gameId);
    const player = game.playersMap.get(playerId);
    if (player) {
      player.state = newState;
    }
  }

  validatePlayerPosition(
    currentLocation: ICartesian3Location,
    newLocation: ICartesian3Location
  ): boolean {
    const currentPosition = new Cesium.Cartesian3(
      currentLocation.x,
      currentLocation.y,
      currentLocation.z
    );
    const newPosition = new Cesium.Cartesian3(
      newLocation.x,
      newLocation.y,
      newLocation.z
    );
    const distance = Cesium.Cartesian3.distance(currentPosition, newPosition);
    return distance < Settings.serverClientDistanceThreshold;
  }

  endGame(gameId: string) {
    const game = this.getGameById(gameId);
    game.bgCharactersManager.stop();

    // TODO other end game logic...
  }
}
