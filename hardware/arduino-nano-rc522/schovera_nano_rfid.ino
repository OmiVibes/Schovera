
#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN 10
#define RST_PIN 9

MFRC522 rfid(SS_PIN, RST_PIN);

String lastUID = "";
unsigned long lastScanTime = 0;
const unsigned long scanCooldown = 2000;

void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfid.PCD_Init();

  delay(100);

  Serial.println("SCHOVERA_RFID_READY");
  rfid.PCD_DumpVersionToSerial();
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  String uid = "";

  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) {
      uid += "0";
    }

    uid += String(rfid.uid.uidByte[i], HEX);

    if (i < rfid.uid.size - 1) {
      uid += ":";
    }
  }

  uid.toUpperCase();

  unsigned long currentTime = millis();

  if (uid != lastUID ||
      currentTime - lastScanTime >= scanCooldown) {

    Serial.print("SCHOVERA_SCAN,");
    Serial.print(uid);
    Serial.print(",");
    Serial.println(currentTime);

    lastUID = uid;
    lastScanTime = currentTime;
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(100);
}
