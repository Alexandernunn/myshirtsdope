import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createSearchRotation, SEARCH_ROTATION_MS, type SearchRotationClock } from "./search-rotation";

class TestClock implements SearchRotationClock {
  time = 0;
  sequence = 0;
  timers = new Map<number, { at: number; callback: () => void }>();
  now = () => this.time;
  schedule = (callback: () => void, delay: number) => {
    assert(delay > 0, "Timers must advance time rather than spin");
    const id = ++this.sequence;
    this.timers.set(id, { at: this.time + delay, callback });
    return () => { this.timers.delete(id); };
  };
  advance(duration: number) {
    const end = this.time + duration;
    let guard = 0;
    while (true) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      assert(++guard < 10000, "Timer loop must terminate");
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.time = end;
  }
}

const ideas = ["Phife", "Its All About The Benjamins", "Yonkers"];
function setup(reducedMotion = false) {
  const clock = new TestClock();
  const changes: { at: number; text: string }[] = [];
  let text = "";
  const rotation = createSearchRotation({
    initialIdeas: ideas,
    reducedMotion,
    clock,
    nextCycle: () => ["Dwele", "Spook By the Door", "Brooklyn"],
    onChange(value) {
      text = value;
      changes.push({ at: clock.now(), text });
    },
  });
  rotation.start();
  return { clock, rotation, changes, text: () => text };
}

for (const reducedMotion of [false, true]) {
  test(`three-second cadence across short/long ideas and cycle rollover; reduced motion ${reducedMotion}`, () => {
    const { clock, text, rotation } = setup(reducedMotion);
    assert.equal(SEARCH_ROTATION_MS, 3000);
    assert.equal(text(), "Search Phife...");
    for (const idea of [...ideas.slice(1), "Dwele", "Spook By the Door", "Brooklyn", "Dwele"]) {
      clock.advance(3000);
      assert.equal(text(), `Search ${idea}...`);
      assert.equal(clock.timers.size, 1);
    }
    rotation.dispose();
    assert.equal(clock.timers.size, 0);
  });
}

test("reduced motion changes complete ideas without intermediate typing/deletion frames", () => {
  const { clock, changes } = setup(true);
  clock.advance(9000);
  assert.deepEqual(changes, [
    { at: 0, text: "Search Phife..." },
    { at: 3000, text: "Search Its All About The Benjamins..." },
    { at: 6000, text: "Search Yonkers..." },
    { at: 9000, text: "Search Dwele..." },
  ]);
});

test("normal motion retains intermediate typewriter frames inside the three seconds", () => {
  const { clock, text, changes } = setup();
  clock.advance(2600);
  assert.notEqual(text(), "Search Phife...");
  assert.notEqual(text(), "Search Its All About The Benjamins...");
  assert(changes.length > 3);
  clock.advance(400);
  assert.equal(text(), "Search Its All About The Benjamins...");
});

for (const pauseAt of [1000, 2400, 2700]) {
  test(`focus, typed input, blur, then clear resume without a stuck pause at ${pauseAt}ms`, () => {
    const { clock, rotation, text } = setup();
    clock.advance(pauseAt);
    rotation.setFocused(true);
    rotation.setHasInput(true);
    assert.equal(text(), "Search...");
    assert.equal(clock.timers.size, 0);
    clock.advance(10000);
    rotation.setFocused(false);
    assert.equal(clock.timers.size, 0, "Input still exists after blur");
    clock.advance(10000);
    rotation.setHasInput(false);
    assert.equal(clock.timers.size, 1);
    clock.advance(3000 - pauseAt);
    assert.equal(text(), "Search Its All About The Benjamins...");
    clock.advance(3000);
    assert.equal(text(), "Search Yonkers...");
  });
}

test("clearing while focused waits for blur, then resumes", () => {
  const { rotation, clock, text } = setup();
  rotation.setFocused(true);
  rotation.setHasInput(true);
  rotation.setHasInput(false);
  clock.advance(9000);
  assert.equal(clock.timers.size, 0);
  rotation.setFocused(false);
  clock.advance(3000);
  assert.equal(text(), "Search Its All About The Benjamins...");
});

test("motion preference changes preserve the next rotation deadline and recover while paused", () => {
  const { clock, rotation, text } = setup();
  clock.advance(2600);
  rotation.setReducedMotion(true);
  assert.equal(text(), "Search Phife...");
  clock.advance(400);
  assert.equal(text(), "Search Its All About The Benjamins...");
  rotation.setFocused(true);
  rotation.setReducedMotion(false);
  clock.advance(6000);
  assert.equal(clock.timers.size, 0);
  rotation.setFocused(false);
  clock.advance(3000);
  assert.equal(text(), "Search Yonkers...");
  rotation.setReducedMotion(true);
  clock.advance(3000);
  assert.equal(text(), "Search Dwele...");
});

test("dispose/remount does not leave orphaned timers or callbacks", () => {
  const { clock, rotation, changes } = setup();
  clock.advance(2400);
  rotation.dispose();
  const count = changes.length;
  rotation.start();
  rotation.setFocused(false);
  rotation.setHasInput(false);
  rotation.setReducedMotion(true);
  clock.advance(9000);
  assert.equal(changes.length, count);
  assert.equal(clock.timers.size, 0);
  let text = "";
  const remount = createSearchRotation({ initialIdeas: ideas, clock, onChange: (value) => { text = value; } });
  remount.start();
  clock.advance(3000);
  assert.equal(text, "Search Its All About The Benjamins...");
  remount.dispose();
  assert.equal(clock.timers.size, 0);
});
