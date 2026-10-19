import { canonicalEvent, eventHash, validateEvent } from '../rfid-simulator/core.ts';
import { canonicalEventV2, eventV2Hash, validateEventV2 } from '../rfid-simulator/event-v2.ts';

export function validateGatewayEvent(value) {
  return value?.schema_version === 2 ? validateEventV2(value) : validateEvent(value);
}

export function canonicalGatewayEvent(event) {
  return event.schema_version === 2 ? canonicalEventV2(event) : canonicalEvent(event);
}

export function gatewayEventHash(event) {
  return event.schema_version === 2 ? eventV2Hash(event) : eventHash(event);
}
