export {};

declare global {
  interface Window {
    forkingHell: {
      snapshot(): {
        x: number; y: number; time: number; depth: number; health: number; score: number;
        paused: boolean; staged: string[]; converted: number; coins: number; started: boolean; gameOver: boolean;
        transition: 'branch' | 'merge' | null; animation: { clip: string; index: number; facing: number };
        mergeCombo: number;
      };
      diagnostics(): {
        engine: string; shaderPasses: number; logical: number[]; physicalPixelScale: number; dpr: number;
        cameraX: number; visibleHazards: number; visibleShots: number; retainedShots: number;
        zoom: number; cameraOrigin: number[];
        worldPixelScales: number[];
        highlightedCopies: number; tuning: ReturnType<typeof import('./tuning').tuningDocument>;
        worldTarget: number[]; filterResolution: number[]; outputResolution: number[]; worldPixelPitch: number;
        crtActive: boolean;
        motionDraws: number;
        retainedCoins: number; activeBranches: number; averageFrameMs: number;
      };
    };
  }
}
