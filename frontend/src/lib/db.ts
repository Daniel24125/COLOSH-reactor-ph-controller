import mqtt from "mqtt";

const MQTT_URL = process.env.NEXT_PUBLIC_MQTT_URL || "ws://127.0.0.1:9001";

let mqttClient: mqtt.MqttClient | null = null;
const pendingRequests = new Map<string, (payload: any) => void>();

function getMqttClient(): Promise<mqtt.MqttClient> {
    return new Promise((resolve) => {
        if (mqttClient && mqttClient.connected) {
            return resolve(mqttClient);
        }
        if (!mqttClient) {
            mqttClient = mqtt.connect(MQTT_URL);
            mqttClient.on('message', (topic, message) => {
                if (topic.startsWith('reactor/db/response/')) {
                    const reqId = topic.split('/').pop();
                    if (reqId && pendingRequests.has(reqId)) {
                        const payload = JSON.parse(message.toString());
                        const resolver = pendingRequests.get(reqId);
                        resolver?.(payload);
                        pendingRequests.delete(reqId);
                    }
                }
            });
        }
        
        if (mqttClient.connected) resolve(mqttClient);
        else mqttClient.once('connect', () => resolve(mqttClient!));
    });
}

class RemoteDb {
    private async query(method: string, sql: string, params: any[] = []) {
        const client = await getMqttClient();
        const reqId = crypto.randomUUID();
        
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pendingRequests.delete(reqId);
                reject(new Error(`MQTT DB request timeout on ${method}`));
            }, 10000);

            pendingRequests.set(reqId, (payload) => {
                clearTimeout(timer);
                if (!payload.success) {
                    reject(new Error(payload.error || "Unknown MQTT DB error"));
                } else {
                    resolve(payload);
                }
            });

            client.subscribe(`reactor/db/response/${reqId}`, (err) => {
                if (err) {
                    clearTimeout(timer);
                    pendingRequests.delete(reqId);
                    return reject(err);
                }
                client.publish(`reactor/db/request`, JSON.stringify({
                    id: reqId, method, sql, params
                }));
            });
        });
    }

    async all<T>(sql: string, params: any[] = []): Promise<T> {
        const result: any = await this.query('all', sql, params);
        return result.data as T;
    }

    async get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
        const result: any = await this.query('get', sql, params);
        return result.data as T | undefined;
    }

    async run(sql: string, params: any[] = []): Promise<any> {
        return this.query('run', sql, params);
    }

    async exec(sql: string): Promise<void> {
        await this.query('exec', sql, []);
    }

    async close(): Promise<void> {}
}

let dbInstance: RemoteDb | null = null;

export async function getDb() {
    if (!dbInstance) {
        dbInstance = new RemoteDb();
    }
    return dbInstance;
}
