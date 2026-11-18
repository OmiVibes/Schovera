#include <WiFiS3.h>
#include "Protocol.h"
#if __has_include("local_config.h")
#include "local_config.h"
#endif
#ifndef SCHOVERA_WIFI_DIAGNOSTICS
#define SCHOVERA_WIFI_DIAGNOSTICS 0
#endif
#ifndef SCHOVERA_WIFI_SSID
#define SCHOVERA_WIFI_SSID ""
#endif
#ifndef SCHOVERA_WIFI_PASSWORD
#define SCHOVERA_WIFI_PASSWORD ""
#endif
#ifndef SCHOVERA_HOST_TEST_ENDPOINT
#define SCHOVERA_HOST_TEST_ENDPOINT "http://127.0.0.1:3187/v1/dry-run"
#endif
#if SCHOVERA_WIFI_DIAGNOSTICS != 0 && SCHOVERA_WIFI_DIAGNOSTICS != 1
#error "Wi-Fi diagnostics must be explicitly 0 or 1"
#endif

SchoveraPhase1::PendingSynthetic observation;
char input[257];size_t used=0;bool overflow=false;
unsigned long lastLed=0,lastWifi=0,lastWifiPoll=0;bool led=false;unsigned int attempts=0;int previousWifi=-999;

void command(char* line){
  if(strcmp(line,"RETRY")==0){if(observation.pending())Serial.println(observation.message());else Serial.println("DIAG no_pending_synthetic_message");return;}
  if(strcmp(line,"STATUS")==0){Serial.println("DIAG synthetic_only; no_reader; RAM_only; no_gateway_delivery");
    if(strcmp(SCHOVERA_HOST_TEST_ENDPOINT,"http://127.0.0.1:3187/v1/dry-run")==0)Serial.println("DIAG host_only_endpoint http://127.0.0.1:3187/v1/dry-run; NOT contacted");
    else Serial.println("DIAG invalid_host_endpoint_configuration; NOT contacted");return;}
  if(strcmp(line,"WIFI_RETRY")==0){attempts=0;lastWifi=millis()-30000UL;return;}
  char* save=nullptr;char* action=strtok_r(line," ",&save);
  if(action&&strcmp(action,"CLEAR")==0){char* id=strtok_r(nullptr," ",&save);if(id&&!strtok_r(nullptr," ",&save)&&observation.clear(id))Serial.println("DIAG discarded_synthetic_RAM_only");else Serial.println("DIAG clear_refused");return;}
  if(action&&strcmp(action,"ARM")==0){char* fields[4];for(int i=0;i<4;i++)fields[i]=strtok_r(nullptr," ",&save);
    if(!strtok_r(nullptr," ",&save)&&observation.arm(fields[0],fields[1],fields[2],fields[3]))Serial.println(observation.message());else Serial.println("DIAG arm_refused_invalid_or_pending");return;}
  Serial.println("DIAG commands: STATUS; ARM session_uuid acquisition_uuid sequence UTC_timestamp; RETRY; CLEAR acquisition_uuid; WIFI_RETRY");
}
void setup(){
  pinMode(LED_BUILTIN,OUTPUT);Serial.begin(115200);unsigned long start=millis();while(!Serial&&millis()-start<1500UL){}
  Serial.println("DIAG Schovera M7A UNO R4 WiFi; synthetic only; RFID not implemented");
  Serial.println("DIAG WiFi diagnostics default OFF; no HTTP requests or cloud credentials");
  lastWifi=millis()-30000UL;
}
void loop(){
  unsigned long now=millis();if(now-lastLed>=500UL){lastLed=now;led=!led;digitalWrite(LED_BUILTIN,led?HIGH:LOW);}
  for(unsigned int consumed=0;Serial.available()&&consumed<64;consumed++) {char c=static_cast<char>(Serial.read());if(c=='\r')continue;if(c==0){overflow=true;continue;}
    if(c=='\n'){if(overflow)Serial.println("DIAG command_too_large");else{input[used]=0;command(input);}used=0;overflow=false;}
    else if(!overflow){if(used<sizeof(input)-1)input[used++]=c;else overflow=true;}
  }
  if(SCHOVERA_WIFI_DIAGNOSTICS&&strlen(SCHOVERA_WIFI_SSID)>0&&now-lastWifiPoll>=1000UL){
    lastWifiPoll=now;
    int state=WiFi.status();if(state!=previousWifi){previousWifi=state;Serial.print("DIAG wifi_status_code=");Serial.println(state);}
    if(state!=WL_CONNECTED&&state!=WL_NO_MODULE&&attempts<5&&now-lastWifi>=30000UL){lastWifi=now;attempts++;Serial.print("DIAG wifi_attempt=");Serial.println(attempts);WiFi.begin(SCHOVERA_WIFI_SSID,SCHOVERA_WIFI_PASSWORD);}
    // No socket, HTTP client, DHCP address disclosure or automatic endpoint probe.
  }
}
