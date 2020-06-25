import {
  VM,
  Ptr,
  Obj,
  ObjPair,
  ObjType,
  NullablePtr,
  ObjNumber,
} from './types';
import { OBJ_SIZE, HEAP_SIZE, STACK_MAX } from './constants';

// Creates a new VM with an empty stack and an empty (but allocated) heap.
export const newVM = (): VM => {
  return {
    stack: [],
    stackSize: 0,
    heap: Array(HEAP_SIZE).fill(null),
    heapStart: 0,
    next: 0,
  };
};

export const freeVM = (vm: VM) => {
  vm.heap = [];
};

export const getObjectCount = (vm: VM) => {
  return (vm.next - vm.heapStart) / OBJ_SIZE;
};

export const lookup = (vm: VM, ptr: Ptr): Obj => {
  return vm.heap[ptr];
};

// Marks [object] as being reachable and still (potentially) in use.
const mark = (vm: VM, ptr: Ptr) => {
  const object = lookup(vm, ptr);
  if (object === null) return;

  // If already marked, we're done. Check this first to aconst recursing
  // on cycles in the object graph.
  if (object.moveTo !== null) return;

  // Any non-zero pointer indicates the object was reached. For no particular
  // reason, we use the object's own address as the marked value.
  object.moveTo = ptr;

  // Recurse into the object's fields.
  if (object.type === 'OBJ_PAIR') {
    const pair = object as ObjPair;
    if (pair.head !== null) {
      mark(vm, pair.head);
    }
    if (pair.tail !== null) {
      mark(vm, pair.tail);
    }
  }
};

// The mark phase of garbage collection. Starting at the roots (in this case,
// just the stack), recursively walks all reachable objects in the VM.
const markAll = (vm: VM) => {
  for (let i = 0; i < vm.stackSize; i++) {
    const ptr = vm.stack[i];
    if (ptr !== null) mark(vm, ptr);
  }
};

// Phase one of the LISP2 algorithm. Walks the entire heap and, for each live
// object, calculates where it will end up after compaction has moved it.
//
// Returns the address of the end of the live section of the heap after
// compaction is done.
const calculateNewLocations = (vm: VM): Ptr => {
  // Calculate the new locations of the objects in the heap.
  let from = vm.heapStart;
  let to = from;
  while (from < vm.next) {
    const object = lookup(vm, from);
    if (object.moveTo !== null) {
      object.moveTo = to;

      // We increase the destination address only when we pass a live object.
      // This effectively slides objects up on memory over dead ones.
      to += OBJ_SIZE;
    }
    from += OBJ_SIZE;
  }
  return to;
};

// Phase two of the LISP2 algorithm. Now that we know where each object *will*
// be, find every reference to an object and update that pointer to the new
// value. This includes reference in the stack, as well as fields in (live)
// objects that point to other objects.
//
// We do this *before* compaction. Since an object's new location is stored in
// [object.moveTo] in the object itself, this needs to be able to find the
// object. Doing this process before objects have been moved ensures we can
// still find them by traversing the *old* pointers.
const updateAllObjectPointers = (vm: VM) => {
  // Walk the stack.
  for (let i = 0; i < vm.stackSize; i++) {
    // Update the pointer on the stack to point to the object's new compacted
    // location.
    const ptr = vm.stack[i];
    if (ptr !== null) {
      const object = lookup(vm, ptr);
      vm.stack[i] = object.moveTo;
    }
  }

  // Walk the heap, fixing fields in live pairs.
  let from = vm.heapStart;
  while (from < vm.next) {
    const object = lookup(vm, from) as ObjPair;
    if (object.moveTo !== null && object.type === 'OBJ_PAIR') {
      if (object.head !== null) {
        object.head = lookup(vm, object.head).moveTo;
      }
      if (object.tail !== null) {
        object.tail = lookup(vm, object.tail).moveTo;
      }
    }
    from += OBJ_SIZE;
  }
};

const memmove = (vm: VM, to: Ptr, object: Obj, size: number) => {
  size; // always 1, no used
  vm.heap[to] = { ...object };
};

// Phase three of the LISP2 algorithm. Now that we know where everything will
// end up, and all of the pointers have been fixed, actually slide all of the
// live objects up in memory.
const compact = (vm: VM) => {
  let from = vm.heapStart;
  while (from < vm.next) {
    const object = lookup(vm, from);
    if (object.moveTo !== null) {
      // Move the object from its old location to its new location.
      const to = object.moveTo;
      memmove(vm, to, object, OBJ_SIZE);
      // Clear the mark.
      lookup(vm, to).moveTo = null;
    }
    from += OBJ_SIZE;
  }
};

// Free memory for all unused objects.
export const gc = (vm: VM) => {
  // Find out which objects are still in use.
  markAll(vm);

  // Determine where they will end up.
  const endHeap = calculateNewLocations(vm);

  // Fix the references to them.
  updateAllObjectPointers(vm);

  // Compact the memory.
  compact(vm);

  // Update the end of the heap to the new post-compaction end.
  vm.next = endHeap;
};

// Create a new object.
//
// This does *not* root the object, so it's important that a GC does not happen
// between calling this and adding a reference to the object in a field or on
// the stack.
export const newObject = (vm: VM, type: ObjType): Ptr => {
  if (vm.next + OBJ_SIZE > vm.heapStart + HEAP_SIZE) {
    gc(vm);

    // If there still isn't room after collection, we can't fit it.
    if (vm.next + OBJ_SIZE > vm.heapStart + HEAP_SIZE) {
      throw new Error('Out of memory');
    }
  }
  const object = {
    type: type,
    moveTo: null,
  };
  const ptr = vm.next;
  vm.heap[ptr] = object;
  vm.next += OBJ_SIZE;
  return ptr;
};

// Pops the top-most reference to an object from the stack.
export const pop = (vm: VM): NullablePtr => {
  return vm.stack[--vm.stackSize];
};

// Pushes a reference to [value] onto the VM's stack.
const push = (vm: VM, value: NullablePtr) => {
  if (vm.stackSize === STACK_MAX) {
    throw new Error('Stack overflow.\n');
  }
  vm.stack[vm.stackSize++] = value;
};

// Creates a new int object and pushes it onto the stack.
export const pushInt = (vm: VM, intValue: number) => {
  const ptr = newObject(vm, 'OBJ_INT');
  const object = lookup(vm, ptr);
  (object as ObjNumber).value = intValue;
  push(vm, ptr);
  return ptr;
};

// Creates a new pair object. The field values for the pair are popped from the
// stack, then the resulting pair is pushed.
export const pushPair = (vm: VM) => {
  // Create the pair before popping the fields. This ensures the fields don't
  // get collected if creating the pair triggers a GC.
  const ptr = newObject(vm, 'OBJ_PAIR');
  const object = lookup(vm, ptr) as ObjPair;
  object.tail = pop(vm);
  object.head = pop(vm);
  push(vm, ptr);
  return ptr;
};
