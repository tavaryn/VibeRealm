import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: 800,
  height: 600,
  backgroundColor: "#111111",
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scene: [GameScene],
};

new Phaser.Game(config);
