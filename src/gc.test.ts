import {
  newVM,
  pushInt,
  pushPair,
  freeVM,
  gc,
  pop,
  lookup,
  getObjectCount,
} from './gc';
import { ObjPair } from './types';

it(`should preserve objects on the stack`, () => {
  const vm = newVM();
  pushInt(vm, 1);
  pushInt(vm, 2);

  gc(vm);
  expect(getObjectCount(vm)).toBe(2);
  freeVM(vm);
});

it(`should collect unreached objects`, () => {
  const vm = newVM();
  pushInt(vm, 1);
  pushInt(vm, 2);
  pop(vm);
  pop(vm);

  gc(vm);
  expect(getObjectCount(vm)).toBe(0);
  freeVM(vm);
});

it(`should reach nessted objects`, () => {
  const vm = newVM();
  pushInt(vm, 1);
  pushInt(vm, 2);
  pushPair(vm);
  pushInt(vm, 3);
  pushInt(vm, 4);
  pushPair(vm);
  pushPair(vm);

  gc(vm);
  expect(getObjectCount(vm)).toBe(7);
  freeVM(vm);
});

it(`should handle cycles`, () => {
  const vm = newVM();
  pushInt(vm, 1);
  pushInt(vm, 2);
  const a = pushPair(vm);
  pushInt(vm, 3);
  pushInt(vm, 4);
  const b = pushPair(vm);

  const objA = lookup(vm, a) as ObjPair;
  objA.tail = b;

  const objB = lookup(vm, b) as ObjPair;
  objB.tail = a;

  gc(vm);
  expect(getObjectCount(vm)).toBe(4);
  freeVM(vm);
});

it(`should test performance`, () => {
  const vm = newVM();

  for (let i = 0; i < 100000; i++) {
    for (let j = 0; j < 20; j++) {
      pushInt(vm, i);
    }

    for (let k = 0; k < 20; k++) {
      pop(vm);
    }
  }
  freeVM(vm);
});
