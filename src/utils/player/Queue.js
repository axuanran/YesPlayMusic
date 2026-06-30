import shuffle from 'lodash/shuffle';

export const REPEAT_MODE = {
  OFF: 'off',
  ON: 'on',
  ONE: 'one',
};

export default class PlayerQueue {
  constructor({
    list = [],
    current = 0,
    shuffledList = [],
    shuffledCurrent = 0,
    shuffleEnabled = false,
    repeatMode = REPEAT_MODE.OFF,
    reversed = false,
    playNextList = [],
  } = {}) {
    this.list = list;
    this.current = current;
    this.shuffledList = shuffledList;
    this.shuffledCurrent = shuffledCurrent;
    this.shuffleEnabled = shuffleEnabled;
    this.repeatMode = repeatMode;
    this.reversed = reversed;
    this.playNextList = playNextList;
  }

  get activeList() {
    return this.shuffleEnabled ? this.shuffledList : this.list;
  }

  get activeCurrent() {
    return this.shuffleEnabled ? this.shuffledCurrent : this.current;
  }

  set activeCurrent(index) {
    if (this.shuffleEnabled) {
      this.shuffledCurrent = index;
    } else {
      this.current = index;
    }
  }

  replace(list, currentTrackId = 'first') {
    this.list = list;
    this.current = 0;
    if (this.shuffleEnabled) {
      this.shuffle(currentTrackId);
    }
    if (currentTrackId !== 'first') {
      this.activeCurrent = this.activeList.indexOf(currentTrackId);
    }
    return this.activeList[this.activeCurrent];
  }

  shuffle(firstTrackId = 'first') {
    let nextList = this.list;
    if (firstTrackId !== 'first') {
      nextList = this.list.filter(trackId => trackId !== firstTrackId);
    }
    this.shuffledList = shuffle(nextList);
    if (firstTrackId !== 'first') {
      this.shuffledList.unshift(firstTrackId);
    }
    this.shuffledCurrent = 0;
  }

  syncCurrentToTrack(trackId) {
    this.activeCurrent = this.activeList.indexOf(trackId);
  }

  getSibling(forward) {
    const dir = forward ? 1 : -1;
    const next = this.reversed
      ? this.activeCurrent - dir
      : this.activeCurrent + dir;

    if (this.repeatMode === REPEAT_MODE.ON) {
      const atBoundary = this.reversed
        ? this.activeCurrent === 0
        : this.activeCurrent + 1 === this.activeList.length;
      if (atBoundary) {
        const wrapTo =
          forward !== this.reversed ? 0 : this.activeList.length - 1;
        return [this.activeList[wrapTo], wrapTo];
      }
    }

    return [this.activeList[next], next];
  }

  takePlayNext() {
    return this.playNextList.shift();
  }

  addPlayNext(trackId) {
    this.playNextList.push(trackId);
  }

  clearPlayNext() {
    this.playNextList.splice(0);
  }

  removePlayNext(index) {
    this.playNextList.splice(index, 1);
  }
}
