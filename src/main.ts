import Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 640,
  backgroundColor: '#0f172a',
  scene: [MainScene],
});
