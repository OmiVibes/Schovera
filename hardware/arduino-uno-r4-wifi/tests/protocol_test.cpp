#include "../diagnostics/Protocol.h"
#include <assert.h>
#include <iostream>
#include <string>
int main(){
  using namespace SchoveraPhase1;
  const char* session="00000000-0000-4000-8000-000000000001";
  const char* id="00000000-0000-4000-8000-000000000002";
  PendingSynthetic pending;assert(!pending.pending());assert(!pending.clear(id));
  assert(!pending.arm(session,id,"0","2026-11-18T09:00:00.000Z"));
  assert(!pending.arm(session,id,"2147483648","2026-11-18T09:00:00.000Z"));
  assert(!pending.arm(session,id,"01","2026-11-18T09:00:00.000Z"));
  assert(!pending.arm(session,id,"1","2026-02-30T09:00:00.000Z"));
  assert(!pending.arm("not-a-session",id,"1","2026-11-18T09:00:00.000Z"));
  assert(timestamp("2028-02-29T00:00:00.000Z"));assert(!timestamp("2027-02-29T00:00:00.000Z"));
  assert(pending.arm(session,id,"1","2026-11-18T09:00:00.000Z"));
  std::string first=pending.message();assert(first.size()<=MaxMessageBytes);
  assert(!pending.arm(session,id,"2","2026-11-18T09:00:01.000Z"));assert(first==pending.message());
  assert(!pending.clear(session));assert(first==pending.message());
  // Print the actual firmware serializer output for independent host validation.
  std::cout<<first<<std::endl;assert(pending.clear(id));assert(!pending.pending());
  assert(pending.arm(session,id,"2147483647","2026-11-18T09:00:00.000Z"));
  std::cout<<"PASS: exact firmware serializer; invalid inputs, retry stability, busy and explicit discard"<<std::endl;
}
