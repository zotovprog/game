// Look-dev: один кадр «так будет выглядеть игра». Используется для выбора стиля.
import { Vector3 } from 'three';
import { Style } from '../data/styles';
import { buildCave } from '../view/cave';
import { addDarkLight, beginDarkLights, commitDarkLights } from '../view/darkness';
import { Dust } from '../view/dust';
import { Human } from '../view/human';
import { Lantern } from '../view/lantern';
import { Fire, Wisp } from '../view/props';
import { Spirit } from '../view/spirit';
import { Stage } from '../view/stage';
import { Grid } from '../world/grid';

export function startLookdev(stage: Stage, style: Style, params: URLSearchParams): (dt: number, t: number) => void {
  const grid = new Grid(40, 40, [
    { pts: [[20, 21], [22, 22]], r: 6.6 },
    { pts: [[20, 21], [27, 13], [36, 10]], r: 2.6 },
    { pts: [[20, 21], [9, 27], [3, 34]], r: 2.2 },
  ], 11);
  const cave = buildCave(grid, style, 11);
  stage.scene.add(cave.group);

  if (params.get('view')) stage.viewH = stage.viewHTarget = Number(params.get('view'));
  const wick = Number(params.get('wick') ?? 0.55);
  const radius = 2.4 + 5.2 * wick;

  const hero = new Human({ cloak: style.cloakPlayer, skin: style.skin, bodyShadow: false });
  hero.root.position.set(20.5, 0, 22);
  hero.root.rotation.y = -0.5;
  const lantern = new Lantern(style, stage.mobile ? 512 : 1024);
  hero.attach(lantern.group);
  lantern.group.position.y = -0.3;
  stage.scene.add(hero.root);

  const old = new Human({ cloak: style.cloakOld, skin: style.skin, hood: false, hair: 0x8a857c, hunch: 0.25 });
  old.root.position.set(17.4, 0, 19.6);
  old.root.rotation.y = 0.9;
  old.setPose('sit', true);
  stage.scene.add(old.root);
  const camp = new Fire(style, 'campfire', 3);
  camp.group.position.set(18.5, 0, 20.4);
  stage.scene.add(camp.group);

  const spirits: Spirit[] = [];
  const spots: [number, number, number][] = [[-0.75, radius + 0.7, 1.0], [0.35, radius + 0.5, 1.1], [2.55, radius + 0.9, 0.95], [3.5, radius + 0.3, 1.15], [-1.3, radius + 2.2, 1.0], [2.3, radius + 3.4, 1.05]];
  spots.forEach(([a, d, tall], i) => {
    const s = new Spirit(style, i * 0.37 + 0.1, tall * 1.12);
    s.group.position.set(hero.root.position.x + Math.cos(a) * d, 0, hero.root.position.z + Math.sin(a) * d);
    s.group.lookAt(hero.root.position.x, 0, hero.root.position.z);
    stage.scene.add(s.group);
    spirits.push(s);
  });

  const wisp = new Wisp(style, 2);
  wisp.group.position.set(32, 1.15, 11);
  stage.scene.add(wisp.group);

  const dust = new Dust(style.lamp);
  stage.scene.add(dust.points);
  stage.target.copy(hero.root.position);
  const lampPos = new Vector3(), focus = new Vector3();

  return (dt, t) => {
    hero.update(dt, t, 0);
    old.update(dt, t, 0);
    camp.update(t, dt);
    wisp.update(t);
    spirits.forEach((s) => s.update(t));
    lantern.update(t, wick, radius, style.lampGain);
    lantern.group.getWorldPosition(lampPos);
    beginDarkLights();
    addDarkLight(lampPos.x, lampPos.y, lampPos.z, radius * (0.96 + 0.04 * lantern.flicker));
    addDarkLight(wisp.group.position.x, 1, wisp.group.position.z, 1.6);
    commitDarkLights(lampPos.x, lampPos.z);
    dust.update(t, lampPos, radius, wick, stage.mobile ? 2 : 2.5 * stage.renderer.getPixelRatio());
    focus.copy(hero.root.position);
    stage.render(dt, focus, lampPos);
  };
}
