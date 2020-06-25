export type Ptr = number;
export type NullablePtr = Ptr | null;

// Two kinds of objects are supported: a (boxed) integer, and a pair of
// references to other objects.
export type ObjType = 'OBJ_INT' | 'OBJ_PAIR';

// A single object in the VM.
export interface Obj {
  // The type of this object.
  type: ObjType;

  // During the sweep phase of garbage collection, this will be non-NULL if the
  // object was reached, otherwise it will be NULL. Before compaction, this
  // will store the address that the object will end up at after compaction.
  // Once garbage collection is done, this is reset to NULL. It is only used
  // during collection.
  moveTo: NullablePtr;
}

export interface ObjNumber extends Obj {
  value: number;
}

export interface ObjPair extends Obj {
  head: NullablePtr;
  tail: NullablePtr;
}

// A virtual machine with its own virtual stack and heap. All objects live on
// the heap. The stack just points to them.
export type VM = {
  stack: NullablePtr[];
  stackSize: number;

  // The beginning of the contiguous heap of memory that objects are allocated
  // from.
  heap: Obj[];

  heapStart: Ptr;
  // The beginning of the next chunk of memory to be allocated from the heap.
  next: Ptr;
};
