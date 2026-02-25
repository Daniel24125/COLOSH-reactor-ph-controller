// useMqtt is now a thin wrapper around the singleton MqttContext.
// All components continue to call useMqtt() without any changes.
export { useMqttContext as useMqtt } from "@/context/MqttContext";
