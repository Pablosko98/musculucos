import type { Block } from './types';

type ActiveBlockState = {
  block: Block;
  dateString: string;
  saveEditedBlock: (dateString: string, block: Block) => void;
  onDeleteBlock: (blockId: string) => void;
};

let _state: ActiveBlockState | null = null;

export function setActiveBlock(state: ActiveBlockState) {
  _state = state;
}

export function getActiveBlock(): ActiveBlockState | null {
  return _state;
}

export function clearActiveBlock() {
  _state = null;
}
