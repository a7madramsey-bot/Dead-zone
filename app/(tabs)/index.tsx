import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ImageBackground,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const battlefield = require('../../assets/images/battlefield.jpg');
const BEST_WAVE_KEY = 'dead-zone.best-wave.v1';
const JOYSTICK_SIZE = 116;
const JOYSTICK_CENTER = JOYSTICK_SIZE / 2;
const JOYSTICK_TRAVEL = 39;
const MAGAZINE_SIZE = 24;

type GameStatus = 'menu' | 'playing' | 'paused' | 'gameover';
type LootKind = 'medkit' | 'ammo';

type Player = {
  x: number;
  y: number;
  hp: number;
  ammo: number;
  reserve: number;
  facing: number;
};

type Zombie = {
  id: number;
  x: number;
  y: number;
  hp: number;
  speed: number;
  nextAttack: number;
  facing: number;
};

type Bullet = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
};

type Loot = {
  id: number;
  x: number;
  y: number;
  kind: LootKind;
};

type GameState = {
  width: number;
  height: number;
  player: Player;
  zombies: Zombie[];
  bullets: Bullet[];
  loot: Loot[];
  kills: number;
  wave: number;
  elapsed: number;
  zoneRadius: number;
  spawnTimer: number;
  fireTimer: number;
  reloadTimer: number;
  nextId: number;
};

type Stick = { x: number; y: number };

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function spawnZombie(game: GameState): Zombie {
  const side = Math.floor(Math.random() * 4);
  const margin = 20;
  let x = margin;
  let y = margin;

  if (side === 0) {
    x = margin;
    y = Math.random() * game.height;
  } else if (side === 1) {
    x = game.width - margin;
    y = Math.random() * game.height;
  } else if (side === 2) {
    x = Math.random() * game.width;
    y = margin;
  } else {
    x = Math.random() * game.width;
    y = game.height - margin;
  }

  return {
    id: game.nextId++,
    x,
    y,
    hp: 1 + Math.floor(game.wave / 5),
    speed: 27 + Math.min(game.wave * 1.8, 28) + Math.random() * 8,
    nextAttack: 0,
    facing: 0,
  };
}

function createGame(width: number, height: number): GameState {
  const game: GameState = {
    width: Math.max(width, 320),
    height: Math.max(height, 520),
    player: {
      x: Math.max(width, 320) / 2,
      y: Math.max(height, 520) * 0.57,
      hp: 100,
      ammo: MAGAZINE_SIZE,
      reserve: 96,
      facing: 0,
    },
    zombies: [],
    bullets: [],
    loot: [],
    kills: 0,
    wave: 1,
    elapsed: 0,
    zoneRadius: Math.min(Math.max(width, 320), Math.max(height, 520)) * 0.44,
    spawnTimer: 0.4,
    fireTimer: 0,
    reloadTimer: 0,
    nextId: 1,
  };

  for (let i = 0; i < 3; i += 1) {
    game.zombies.push(spawnZombie(game));
  }
  return game;
}

function beginReload(game: GameState) {
  if (game.reloadTimer > 0 || game.player.ammo >= MAGAZINE_SIZE) return;
  if (game.player.reserve <= 0) return;
  game.reloadTimer = 1.15;
}

function updateGame(game: GameState, dt: number, stick: Stick, firing: boolean) {
  const player = game.player;
  game.elapsed += dt;
  game.wave = Math.floor(game.kills / 8) + 1;

  const stickLength = Math.hypot(stick.x, stick.y);
  if (stickLength > 0.08) {
    const moveX = stick.x / Math.max(stickLength, 1);
    const moveY = stick.y / Math.max(stickLength, 1);
    const movementSpeed = 172;
    player.x += moveX * movementSpeed * dt;
    player.y += moveY * movementSpeed * dt;
    player.facing = (Math.atan2(moveY, moveX) * 180) / Math.PI + 90;
  }

  player.x = Math.max(18, Math.min(game.width - 18, player.x));
  player.y = Math.max(18, Math.min(game.height - 18, player.y));

  const minDimension = Math.min(game.width, game.height);
  game.zoneRadius = Math.max(minDimension * 0.22, minDimension * 0.44 - game.elapsed * 0.72);
  if (distance(player.x, player.y, game.width / 2, game.height / 2) > game.zoneRadius) {
    player.hp -= dt * 5;
  }

  if (game.reloadTimer > 0) {
    game.reloadTimer = Math.max(0, game.reloadTimer - dt);
    if (game.reloadTimer === 0) {
      const needed = MAGAZINE_SIZE - player.ammo;
      const loaded = Math.min(needed, player.reserve);
      player.ammo += loaded;
      player.reserve -= loaded;
    }
  }

  game.spawnTimer -= dt;
  const spawnDelay = Math.max(0.48, 1.65 - game.wave * 0.075);
  if (game.spawnTimer <= 0 && game.zombies.length < 16) {
    game.zombies.push(spawnZombie(game));
    game.spawnTimer = spawnDelay;
  }

  game.fireTimer -= dt;
  if (firing && game.reloadTimer <= 0) {
    if (player.ammo <= 0) {
      beginReload(game);
    } else if (game.fireTimer <= 0) {
      let target: Zombie | undefined;
      let targetDistance = Number.POSITIVE_INFINITY;
      for (const zombie of game.zombies) {
        const nextDistance = distance(player.x, player.y, zombie.x, zombie.y);
        if (nextDistance < targetDistance) {
          targetDistance = nextDistance;
          target = zombie;
        }
      }

      if (target) {
        const angle = Math.atan2(target.y - player.y, target.x - player.x);
        player.facing = (angle * 180) / Math.PI + 90;
        game.bullets.push({
          id: game.nextId++,
          x: player.x,
          y: player.y - 15,
          vx: Math.cos(angle) * 430,
          vy: Math.sin(angle) * 430,
          life: 0.72,
        });
      }
      player.ammo -= 1;
      game.fireTimer = 0.23;
    }
  }

  for (const zombie of game.zombies) {
    const dx = player.x - zombie.x;
    const dy = player.y - zombie.y;
    const gap = Math.hypot(dx, dy) || 1;
    zombie.facing = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (gap > 23) {
      zombie.x += (dx / gap) * zombie.speed * dt;
      zombie.y += (dy / gap) * zombie.speed * dt;
    } else if (game.elapsed >= zombie.nextAttack) {
      player.hp -= 11;
      zombie.nextAttack = game.elapsed + 0.86;
    }
  }

  const movingBullets: Bullet[] = [];
  for (const bullet of game.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (
      bullet.life > 0 &&
      bullet.x >= -10 &&
      bullet.x <= game.width + 10 &&
      bullet.y >= -10 &&
      bullet.y <= game.height + 10
    ) {
      movingBullets.push(bullet);
    }
  }
  game.bullets = movingBullets;

  const survivors: Zombie[] = [];
  for (const zombie of game.zombies) {
    const hitIndex = game.bullets.findIndex(
      (bullet) => distance(bullet.x, bullet.y, zombie.x, zombie.y) < 19,
    );
    if (hitIndex >= 0) {
      game.bullets.splice(hitIndex, 1);
      zombie.hp -= 1;
    }

    if (zombie.hp <= 0) {
      game.kills += 1;
      if (Math.random() < 0.11) {
        game.loot.push({
          id: game.nextId++,
          x: zombie.x,
          y: zombie.y,
          kind: Math.random() < 0.5 ? 'medkit' : 'ammo',
        });
      }
    } else {
      survivors.push(zombie);
    }
  }
  game.zombies = survivors;

  const remainingLoot: Loot[] = [];
  for (const item of game.loot) {
    const closeEnough = distance(player.x, player.y, item.x, item.y) < 27;
    const canCollect =
      closeEnough &&
      (item.kind === 'ammo' ? player.reserve < 120 : player.hp < 91);
    if (canCollect) {
      if (item.kind === 'ammo') {
        player.reserve = Math.min(120, player.reserve + 24);
      } else {
        player.hp = Math.min(100, player.hp + 34);
      }
    } else {
      remainingLoot.push(item);
    }
  }
  game.loot = remainingLoot;
  player.hp = Math.min(100, player.hp);
}

function ArabicText({
  children,
  style,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text
      {...props}
      style={[{ writingDirection: 'rtl', textAlign: 'right' }, style]}
    >
      {children}
    </Text>
  );
}

export default function DeadZoneGame() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<GameStatus>('menu');
  const [bestWave, setBestWave] = useState(1);
  const [renderFrame, setRenderFrame] = useState(0);
  const [fieldSize, setFieldSize] = useState({ width: 0, height: 0 });
  const [stickVisual, setStickVisual] = useState<Stick>({ x: 0, y: 0 });

  const gameRef = useRef<GameState | null>(null);
  const statusRef = useRef<GameStatus>('menu');
  const stickRef = useRef<Stick>({ x: 0, y: 0 });
  const firingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const lastPaintRef = useRef(0);
  const bestWaveRef = useRef(1);
  const savedRunRef = useRef(0);
  const runNumberRef = useRef(0);

  const setGameStatus = (nextStatus: GameStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  };

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(BEST_WAVE_KEY)
      .then((stored) => {
        const parsed = Number(stored);
        if (active && Number.isFinite(parsed) && parsed > 0) {
          bestWaveRef.current = parsed;
          setBestWave(parsed);
        }
      })
      .catch(() => {
        // The game remains playable if local score storage is unavailable.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const finishGame = () => {
      const current = gameRef.current;
      if (!current || statusRef.current !== 'playing') return;
      setGameStatus('gameover');
      if (savedRunRef.current !== runNumberRef.current) {
        savedRunRef.current = runNumberRef.current;
        if (current.wave > bestWaveRef.current) {
          bestWaveRef.current = current.wave;
          setBestWave(current.wave);
          AsyncStorage.setItem(BEST_WAVE_KEY, String(current.wave)).catch(() => {});
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
    };

    const tick = (timestamp: number) => {
      const elapsed = lastFrameRef.current
        ? Math.min((timestamp - lastFrameRef.current) / 1000, 0.05)
        : 0;
      lastFrameRef.current = timestamp;

      if (statusRef.current === 'playing' && gameRef.current) {
        const game = gameRef.current;
        updateGame(game, elapsed, stickRef.current, firingRef.current);
        if (game.player.hp <= 0) {
          game.player.hp = 0;
          finishGame();
        }
        if (timestamp - lastPaintRef.current > 48) {
          lastPaintRef.current = timestamp;
          setRenderFrame((frame) => frame + 1);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onFieldLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFieldSize({ width, height });
  };

  const startGame = () => {
    runNumberRef.current += 1;
    savedRunRef.current = 0;
    gameRef.current = createGame(fieldSize.width, fieldSize.height);
    stickRef.current = { x: 0, y: 0 };
    firingRef.current = false;
    setStickVisual({ x: 0, y: 0 });
    lastFrameRef.current = 0;
    setGameStatus('playing');
    setRenderFrame((frame) => frame + 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const moveJoystick = (x: number, y: number) => {
    let dx = x - JOYSTICK_CENTER;
    let dy = y - JOYSTICK_CENTER;
    const length = Math.hypot(dx, dy);
    if (length > JOYSTICK_TRAVEL) {
      dx = (dx / length) * JOYSTICK_TRAVEL;
      dy = (dy / length) * JOYSTICK_TRAVEL;
    }
    const normalized = {
      x: dx / JOYSTICK_TRAVEL,
      y: dy / JOYSTICK_TRAVEL,
    };
    stickRef.current = normalized;
    setStickVisual(normalized);
  };

  const joystickResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) =>
        moveJoystick(event.nativeEvent.locationX, event.nativeEvent.locationY),
      onPanResponderMove: (event) =>
        moveJoystick(event.nativeEvent.locationX, event.nativeEvent.locationY),
      onPanResponderRelease: () => {
        stickRef.current = { x: 0, y: 0 };
        setStickVisual({ x: 0, y: 0 });
      },
      onPanResponderTerminate: () => {
        stickRef.current = { x: 0, y: 0 };
        setStickVisual({ x: 0, y: 0 });
      },
    }),
  ).current;

  const requestReload = () => {
    const game = gameRef.current;
    if (!game || statusRef.current !== 'playing') return;
    beginReload(game);
    setRenderFrame((frame) => frame + 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const game = gameRef.current;
  const player = game?.player;
  const health = Math.max(0, Math.round(player?.hp ?? 100));
  const ammo = player?.ammo ?? MAGAZINE_SIZE;
  const reserve = player?.reserve ?? 96;
  const wave = game?.wave ?? 1;
  const kills = game?.kills ?? 0;
  const reloading = (game?.reloadTimer ?? 0) > 0;

  const panelStyle = {
    backgroundColor: `${colors.card}E8`,
    borderColor: colors.border,
  };
  const accentText = { color: colors.accent };
  const buttonStyle = { backgroundColor: colors.primary };

  return (
    <View
      style={[styles.root, { backgroundColor: colors.background }]}
      onLayout={onFieldLayout}
      testID="game-screen"
    >
      <StatusBar hidden style="light" />
      <ImageBackground
        source={battlefield}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
        imageStyle={styles.battlefieldImage}
      >
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: 0.34 }]}
        />

        {game && (
          <Svg
            width={fieldSize.width}
            height={fieldSize.height}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Circle
              cx={fieldSize.width / 2}
              cy={fieldSize.height / 2}
              r={game.zoneRadius}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2}
              strokeDasharray="11 9"
              opacity={0.74}
            />
            <Circle
              cx={fieldSize.width / 2}
              cy={fieldSize.height / 2}
              r={Math.max(0, game.zoneRadius - 5)}
              fill="none"
              stroke={colors.accent}
              strokeWidth={1}
              opacity={0.2}
            />

            {game.loot.map((item) => (
              <G key={`loot-${item.id}`} x={item.x} y={item.y}>
                <Circle r={12} fill={item.kind === 'medkit' ? colors.destructive : colors.accent} />
                {item.kind === 'medkit' ? (
                  <Path
                    d="M-5 0h10M0-5v10"
                    stroke={colors.foreground}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                ) : (
                  <>
                    <Rect x={-5} y={-4} width={3} height={8} rx={1} fill={colors.foreground} />
                    <Rect x={1} y={-4} width={3} height={8} rx={1} fill={colors.foreground} />
                  </>
                )}
              </G>
            ))}

            {game.bullets.map((bullet) => (
              <G key={`bullet-${bullet.id}`}>
                <Line
                  x1={bullet.x - bullet.vx * 0.022}
                  y1={bullet.y - bullet.vy * 0.022}
                  x2={bullet.x}
                  y2={bullet.y}
                  stroke={colors.accent}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                <Circle cx={bullet.x} cy={bullet.y} r={2.2} fill={colors.foreground} />
              </G>
            ))}

            {game.zombies.map((zombie) => (
              <G
                key={`zombie-${zombie.id}`}
                transform={`translate(${zombie.x} ${zombie.y}) rotate(${zombie.facing})`}
              >
                <Circle cx={0} cy={8} r={13} fill={colors.background} opacity={0.6} />
                <Rect x={-8} y={-8} width={16} height={24} rx={5} fill={colors.mutedForeground} />
                <Circle cx={0} cy={-12} r={8} fill={colors.accent} />
                <Path d="M-8-14 Q0-24 8-14 L7-9 L-7-9Z" fill={colors.destructive} />
                <Circle cx={-3} cy={-12} r={1.4} fill={colors.foreground} />
                <Circle cx={3} cy={-12} r={1.4} fill={colors.foreground} />
                <Line x1={-8} y1={0} x2={-13} y2={8} stroke={colors.mutedForeground} strokeWidth={4} />
                <Line x1={8} y1={0} x2={13} y2={8} stroke={colors.mutedForeground} strokeWidth={4} />
              </G>
            ))}

            <G
              transform={`translate(${game.player.x} ${game.player.y}) rotate(${game.player.facing})`}
            >
              <Circle cx={0} cy={8} r={14} fill={colors.background} opacity={0.68} />
              <Rect x={-9} y={-9} width={18} height={27} rx={5} fill={colors.primary} />
              <Circle cx={0} cy={-13} r={8} fill={colors.foreground} />
              <Path d="M-9-15 Q0-27 9-15 L8-10 L-8-10Z" fill={colors.secondaryForeground} />
              <Rect x={-2} y={-35} width={4} height={20} rx={2} fill={colors.secondaryForeground} />
              <Rect x={-4} y={-24} width={8} height={8} rx={2} fill={colors.accent} />
              <Line x1={-9} y1={-1} x2={-14} y2={8} stroke={colors.primary} strokeWidth={4} />
              <Line x1={9} y1={-1} x2={14} y2={8} stroke={colors.primary} strokeWidth={4} />
            </G>
          </Svg>
        )}

        {status === 'menu' ? (
          <View style={styles.menuLayer} pointerEvents="box-none">
            <View style={[styles.menuTop, { top: insets.top + 18 }]}>
              <View style={styles.brandLockup}>
                <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
                  <MaterialCommunityIcons name="target" size={20} color={colors.primaryForeground} />
                </View>
                <View>
                  <Text style={[styles.brandName, { color: colors.foreground }]}>DEAD ZONE</Text>
                  <Text style={[styles.brandMeta, { color: colors.mutedForeground }]}>SURVIVAL PROTOCOL</Text>
                </View>
              </View>
              <View style={[styles.offlinePill, panelStyle]}>
                <View style={[styles.onlineDot, { backgroundColor: colors.accent }]} />
                <ArabicText style={[styles.offlineText, { color: colors.foreground }]}>تعمل دون إنترنت</ArabicText>
              </View>
            </View>

            <View style={styles.heroCopy}>
              <View style={[styles.eyebrow, { borderColor: colors.primary }]}>
                <Text style={[styles.eyebrowText, { color: colors.accent }]}>LAST STAND • 01</Text>
              </View>
              <ArabicText style={[styles.heroTitle, { color: colors.foreground }]}>
                منطقة الموت
              </ArabicText>
              <ArabicText style={[styles.heroSubtitle, { color: colors.secondaryForeground }]}>
                قاوم موجات المصابين. لا تدع المنطقة تبتلعك.
              </ArabicText>
              <View style={styles.menuStats}>
                <View style={[styles.menuStat, panelStyle]}>
                  <MaterialCommunityIcons name="trophy-outline" size={17} color={colors.accent} />
                  <ArabicText style={[styles.menuStatValue, { color: colors.foreground }]}>
                    أفضل موجة {bestWave}
                  </ArabicText>
                </View>
                <View style={[styles.menuStat, panelStyle]}>
                  <MaterialCommunityIcons name="wifi-off" size={17} color={colors.accent} />
                  <ArabicText style={[styles.menuStatValue, { color: colors.foreground }]}>
                    لعب كامل بلا اتصال
                  </ArabicText>
                </View>
              </View>
            </View>

            <View style={[styles.menuBottom, { bottom: insets.bottom + 22 }]}>
              <View style={styles.howToRow}>
                <View style={[styles.howToIcon, { backgroundColor: colors.secondary }]}>
                  <MaterialCommunityIcons name="gamepad-variant-outline" size={18} color={colors.accent} />
                </View>
                <ArabicText style={[styles.howToText, { color: colors.secondaryForeground }]}>
                  حرّك العصا للتنقل، واضغط مطولًا للإطلاق. التصويب تلقائي.
                </ArabicText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ابدأ لعبة جديدة"
                testID="start-game"
                onPress={startGame}
                style={({ pressed }) => [
                  styles.startButton,
                  buttonStyle,
                  pressed && styles.buttonPressed,
                ]}
              >
                <MaterialCommunityIcons name="play" size={22} color={colors.primaryForeground} />
                <ArabicText style={[styles.startButtonText, { color: colors.primaryForeground }]}>
                  ابدأ النجاة
                </ArabicText>
                <MaterialCommunityIcons name="arrow-left" size={19} color={colors.primaryForeground} />
              </Pressable>
              <Text style={[styles.versionText, { color: colors.mutedForeground }]}>
                الإصدار 1.0  ·  خريطة نقطة التفتيش
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View style={[styles.hud, { top: insets.top + 14 }]} pointerEvents="box-none">
              <View style={[styles.hudCard, panelStyle]}>
                <View style={styles.hudStat}>
                  <Text style={[styles.hudLabel, { color: colors.mutedForeground }]}>WAVE</Text>
                  <Text style={[styles.hudNumber, accentText]}>{String(wave).padStart(2, '0')}</Text>
                </View>
                <View style={[styles.hudDivider, { backgroundColor: colors.border }]} />
                <View style={styles.hudStat}>
                  <Text style={[styles.hudLabel, { color: colors.mutedForeground }]}>KILLS</Text>
                  <Text style={[styles.hudNumber, { color: colors.foreground }]}>{kills}</Text>
                </View>
              </View>

              <View style={styles.hudRight}>
                <View style={[styles.healthCard, panelStyle]}>
                  <View style={styles.healthHeading}>
                    <MaterialCommunityIcons name="heart" size={16} color={colors.destructive} />
                    <Text style={[styles.healthNumber, { color: colors.foreground }]}>{health}</Text>
                  </View>
                  <View style={[styles.healthTrack, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.healthFill,
                        {
                          width: `${health}%`,
                          backgroundColor: health > 35 ? colors.accent : colors.destructive,
                        },
                      ]}
                    />
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={status === 'paused' ? 'استئناف اللعبة' : 'إيقاف مؤقت'}
                  testID="pause-game"
                  onPress={() => {
                    setGameStatus(status === 'playing' ? 'paused' : 'playing');
                    firingRef.current = false;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  }}
                  style={({ pressed }) => [
                    styles.pauseButton,
                    panelStyle,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={status === 'paused' ? 'play' : 'pause'}
                    size={21}
                    color={colors.foreground}
                  />
                </Pressable>
              </View>
            </View>

            <View style={[styles.zoneLabel, { top: insets.top + 82, backgroundColor: `${colors.background}C9` }]}>
              <View style={[styles.zoneDot, { backgroundColor: colors.accent }]} />
              <ArabicText style={[styles.zoneLabelText, { color: colors.secondaryForeground }]}>
                {reloading ? 'جارٍ تلقيم السلاح' : 'المنطقة الآمنة تتقلّص'}
              </ArabicText>
            </View>

            {status === 'playing' && (
              <View style={[styles.controls, { bottom: insets.bottom + 24 }]} pointerEvents="box-none">
                <View
                  {...joystickResponder.panHandlers}
                  accessibilityLabel="عصا تحريك اللاعب"
                  testID="movement-joystick"
                  style={[
                    styles.joystick,
                    { backgroundColor: `${colors.background}A8`, borderColor: `${colors.foreground}55` },
                  ]}
                >
                  <View style={[styles.joystickRing, { borderColor: `${colors.foreground}36` }]} />
                  <View
                    style={[
                      styles.joystickThumb,
                      {
                        backgroundColor: colors.primary,
                        borderColor: colors.primaryForeground,
                        transform: [
                          { translateX: stickVisual.x * JOYSTICK_TRAVEL },
                          { translateY: stickVisual.y * JOYSTICK_TRAVEL },
                        ],
                      },
                    ]}
                  />
                </View>

                <View style={styles.actionControls}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="إعادة تلقيم السلاح"
                    testID="reload-button"
                    onPress={requestReload}
                    style={({ pressed }) => [
                      styles.reloadButton,
                      panelStyle,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <MaterialCommunityIcons name="reload" size={21} color={colors.foreground} />
                    <Text style={[styles.reloadCount, { color: colors.mutedForeground }]}>
                      {reserve}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="اضغط مطولًا لإطلاق النار"
                    testID="fire-button"
                    onPressIn={() => {
                      firingRef.current = true;
                    }}
                    onPressOut={() => {
                      firingRef.current = false;
                    }}
                    style={({ pressed }) => [
                      styles.fireButton,
                      { backgroundColor: colors.primary, borderColor: `${colors.foreground}8A` },
                      pressed && styles.fireButtonPressed,
                    ]}
                  >
                    <MaterialCommunityIcons name="target" size={33} color={colors.primaryForeground} />
                    <Text style={[styles.fireAmmo, { color: colors.primaryForeground }]}>
                      {String(ammo).padStart(2, '0')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </>
        )}

        {(status === 'paused' || status === 'gameover') && (
          <View style={styles.modalShade}>
            <View style={[styles.modalCard, panelStyle]}>
              <View style={[styles.modalIcon, { backgroundColor: colors.secondary }]}>
                <MaterialCommunityIcons
                  name={status === 'paused' ? 'pause' : 'skull-outline'}
                  size={27}
                  color={status === 'paused' ? colors.accent : colors.destructive}
                />
              </View>
              <ArabicText style={[styles.modalTitle, { color: colors.foreground }]}>
                {status === 'paused' ? 'استراحة قصيرة' : 'انتهت الجولة'}
              </ArabicText>
              <ArabicText style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                {status === 'paused'
                  ? 'خذ نفسًا، ثم عُد إلى نقطة التفتيش.'
                  : `وصلت إلى الموجة ${wave} وأسقطت ${kills} مصابًا.`}
              </ArabicText>
              {status === 'gameover' && (
                <View style={[styles.resultStrip, { backgroundColor: colors.secondary }]}>
                  <ArabicText style={[styles.resultText, { color: colors.secondaryForeground }]}>
                    أفضل موجة محفوظة: {bestWave}
                  </ArabicText>
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={status === 'paused' ? 'متابعة اللعبة' : 'ابدأ جولة جديدة'}
                testID={status === 'paused' ? 'resume-game' : 'restart-game'}
                onPress={status === 'paused' ? () => setGameStatus('playing') : startGame}
                style={({ pressed }) => [
                  styles.modalPrimary,
                  buttonStyle,
                  pressed && styles.buttonPressed,
                ]}
              >
                <MaterialCommunityIcons
                  name={status === 'paused' ? 'play' : 'restart'}
                  size={21}
                  color={colors.primaryForeground}
                />
                <ArabicText style={[styles.modalPrimaryText, { color: colors.primaryForeground }]}>
                  {status === 'paused' ? 'تابع القتال' : 'جولة جديدة'}
                </ArabicText>
              </Pressable>
              {status === 'paused' && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setGameStatus('menu')}
                  style={styles.backButton}
                >
                  <ArabicText style={[styles.backButtonText, { color: colors.mutedForeground }]}>
                    العودة إلى القائمة
                  </ArabicText>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </ImageBackground>
      <Text accessible={false} style={styles.hiddenFrame}>
        {renderFrame}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  battlefieldImage: { opacity: 0.96 },
  menuLayer: { ...StyleSheet.absoluteFill, justifyContent: 'center' },
  menuTop: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  brandMeta: { fontSize: 8, fontWeight: '700', letterSpacing: 1.7, marginTop: 2 },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 30,
    paddingHorizontal: 11,
    paddingVertical: 8,
    gap: 7,
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3 },
  offlineText: { fontSize: 10, fontWeight: '700' },
  heroCopy: { marginHorizontal: 24, marginTop: -25, alignItems: 'flex-end' },
  eyebrow: { borderBottomWidth: 1, paddingBottom: 5, marginBottom: 12 },
  eyebrowText: { fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  heroTitle: { fontSize: 43, fontWeight: '900', letterSpacing: -1.4, marginBottom: 8 },
  heroSubtitle: { fontSize: 14, lineHeight: 23, maxWidth: 290, marginBottom: 22 },
  menuStats: { flexDirection: 'row-reverse', gap: 8 },
  menuStat: {
    minHeight: 38,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 10,
    gap: 7,
  },
  menuStatValue: { fontSize: 10, fontWeight: '700' },
  menuBottom: { position: 'absolute', left: 20, right: 20, gap: 14 },
  howToRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11, paddingHorizontal: 2 },
  howToIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howToText: { flex: 1, fontSize: 11, lineHeight: 18 },
  startButton: {
    height: 58,
    borderRadius: 17,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  startButtonText: { fontSize: 16, fontWeight: '900' },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  versionText: { textAlign: 'center', fontSize: 9, letterSpacing: 0.3 },
  hud: {
    position: 'absolute',
    left: 15,
    right: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  hudCard: {
    minHeight: 51,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  hudStat: { alignItems: 'center', minWidth: 30 },
  hudLabel: { fontSize: 7, fontWeight: '900', letterSpacing: 1.4 },
  hudNumber: { fontSize: 17, fontWeight: '900', marginTop: 1 },
  hudDivider: { width: 1, height: 26 },
  hudRight: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  healthCard: {
    width: 82,
    height: 51,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 9,
    justifyContent: 'center',
    gap: 5,
  },
  healthHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  healthNumber: { fontSize: 12, fontWeight: '900' },
  healthTrack: { height: 5, borderRadius: 5, overflow: 'hidden' },
  healthFill: { height: '100%', borderRadius: 5 },
  pauseButton: {
    width: 49,
    height: 51,
    borderWidth: 1,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneLabel: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
  },
  zoneDot: { width: 6, height: 6, borderRadius: 3 },
  zoneLabelText: { fontSize: 9, fontWeight: '700' },
  controls: {
    position: 'absolute',
    left: 19,
    right: 19,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  joystick: {
    width: JOYSTICK_SIZE,
    height: JOYSTICK_SIZE,
    borderWidth: 1,
    borderRadius: JOYSTICK_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joystickRing: {
    position: 'absolute',
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1,
  },
  joystickThumb: {
    width: 37,
    height: 37,
    borderRadius: 19,
    borderWidth: 2,
  },
  actionControls: { flexDirection: 'row', alignItems: 'flex-end', gap: 11 },
  reloadButton: {
    width: 48,
    height: 51,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  reloadCount: { fontSize: 8, fontWeight: '800', marginTop: 2 },
  fireButton: {
    width: 83,
    height: 83,
    borderWidth: 2,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  fireButtonPressed: { transform: [{ scale: 0.94 }], opacity: 0.88 },
  fireAmmo: { fontSize: 10, fontWeight: '900', marginTop: -2 },
  modalShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 8, 6, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: 26,
    padding: 23,
    alignItems: 'center',
  },
  modalIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 24, fontWeight: '900', marginBottom: 6 },
  modalSubtitle: { fontSize: 12, lineHeight: 20, textAlign: 'center', marginBottom: 17 },
  resultStrip: { width: '100%', borderRadius: 13, padding: 11, marginBottom: 15 },
  resultText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  modalPrimary: {
    height: 53,
    width: '100%',
    borderRadius: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  modalPrimaryText: { fontSize: 14, fontWeight: '900' },
  backButton: { padding: 12, marginTop: 4 },
  backButtonText: { fontSize: 12, fontWeight: '700' },
  hiddenFrame: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
