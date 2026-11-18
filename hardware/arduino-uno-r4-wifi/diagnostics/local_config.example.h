#pragma once
// Copy to ignored local_config.h ONLY for a separately approved Wi-Fi check.
// Never commit SSIDs/passwords. Default firmware builds with diagnostics OFF.
#define SCHOVERA_WIFI_DIAGNOSTICS 0
#define SCHOVERA_WIFI_SSID ""
#define SCHOVERA_WIFI_PASSWORD ""
// This address is for the PC's dry-run validator. The Arduino does NOT contact it.
#define SCHOVERA_HOST_TEST_ENDPOINT "http://127.0.0.1:3187/v1/dry-run"
