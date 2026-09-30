import Phaser from 'phaser';
import { RosterScene } from './scenes/RosterScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 640,
  backgroundColor: '#0f172a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [RosterScene],
});
