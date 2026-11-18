#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

// No Arduino dependency: this exact serializer is also executed by native tests.
namespace SchoveraPhase1 {
constexpr size_t MaxMessageBytes = 512;
inline bool uuid(const char* s) {
  if (!s || strlen(s) != 36) return false;
  for (size_t i=0;i<36;i++) {
    if (i==8 || i==13 || i==18 || i==23) { if(s[i]!='-') return false; }
    else if (!((s[i]>='0'&&s[i]<='9')||(s[i]>='a'&&s[i]<='f'))) return false;
  }
  return s[14]=='4' && (s[19]=='8'||s[19]=='9'||s[19]=='a'||s[19]=='b');
}
inline int number(const char* s, size_t at, size_t count) {
  int value=0; for(size_t i=at;i<at+count;i++) { if(s[i]<'0'||s[i]>'9') return -1; value=value*10+s[i]-'0'; } return value;
}
inline bool timestamp(const char* s) {
  if(!s||strlen(s)!=24||s[4]!='-'||s[7]!='-'||s[10]!='T'||s[13]!=':'||s[16]!=':'||s[19]!='.'||s[23]!='Z')return false;
  int y=number(s,0,4),m=number(s,5,2),d=number(s,8,2),h=number(s,11,2),n=number(s,14,2),sec=number(s,17,2);
  if(y<2000||y>2099||m<1||m>12||h<0||h>23||n<0||n>59||sec<0||sec>59||number(s,20,3)<0)return false;
  const int days[]={31,28,31,30,31,30,31,31,30,31,30,31};
  return d>=1&&d<=days[m-1]+(m==2&&y%4==0?1:0);
}
inline bool sequence(const char* s, uint32_t& result) {
  if(!s||!s[0]||strlen(s)>10||s[0]=='0')return false;
  uint64_t value=0;for(size_t i=0;s[i];i++){if(s[i]<'0'||s[i]>'9')return false;value=value*10+(s[i]-'0');}
  if(value<1||value>2147483647UL)return false;
  result=static_cast<uint32_t>(value);return true;
}
class PendingSynthetic {
  char buffer_[MaxMessageBytes+1]={0};char id_[37]={0};
public:
  bool pending() const {return buffer_[0]!=0;}
  const char* message() const {return buffer_;}
  // Host-supplied timestamp is synthetic test evidence, never a measured card time.
  bool arm(const char* session,const char* acquisition,const char* seq,const char* observed) {
    uint32_t value=0;if(pending()||!uuid(session)||!uuid(acquisition)||!sequence(seq,value)||!timestamp(observed))return false;
    int size=snprintf(buffer_,sizeof(buffer_),"{\"schema\":\"schovera.arduino.acquisition\",\"version\":1,\"kind\":\"synthetic\",\"device\":\"uno-r4-wifi-phase1\",\"session_id\":\"%s\",\"acquisition_id\":\"%s\",\"sequence\":%lu,\"observed_at\":\"%s\",\"event_type\":\"check_in\"}",session,acquisition,static_cast<unsigned long>(value),observed);
    if(size<0||static_cast<size_t>(size)>=sizeof(buffer_)){buffer_[0]=0;return false;}
    memcpy(id_,acquisition,37);return true;
  }
  // This is deliberate RAM discard, NOT a durable host/destination acknowledgement.
  bool clear(const char* id){if(!id||!pending()||strcmp(id_,id)!=0)return false;buffer_[0]=0;id_[0]=0;return true;}
};
}
