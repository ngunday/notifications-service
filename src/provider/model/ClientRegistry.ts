import {Identity} from 'openfin/_v2/main';
import {injectable, inject} from 'inversify';
import {Signal} from 'openfin-service-signal';

import {APITopic, Events} from '../../client/internal';
import {Inject} from '../common/Injectables';
import {ServiceStore} from '../store/ServiceStore';
import {RegisterApplication} from '../store/Actions';

import {APIHandler} from './APIHandler';
import {Environment, StoredApplication} from './Environment';
import {LaunchApplicationError} from './Errors';

/**
 * Client registry is responsible for keeping track of active clients, storing information about them
 * and re-launching them when requested by other modules. Is intended to be used solely by EventPump.
 */
@injectable()
export class ClientRegistry {
    public readonly onAppActionReady: Signal<[Identity]> = new Signal();

    private readonly _apiHandler: APIHandler<APITopic, Events>;
    private readonly _store: ServiceStore;
    private readonly _environment: Environment;

    private _actionReadyWindows: Identity[] = [];

    constructor(
        @inject(Inject.API_HANDLER) apiHandler: APIHandler<APITopic, Events>,
        @inject(Inject.STORE) store: ServiceStore,
        @inject(Inject.ENVIRONMENT) environment: Environment
    ) {
        this._apiHandler = apiHandler;
        this._apiHandler.onConnection.add(this.onClientConnection, this);
        this._apiHandler.onDisconnection.add(this.removeActiveClient, this);

        this._store = store;
        this._environment = environment;
    }

    /**
     * Launches the app with specified identity if the start-up information about it was stored previously.
     *
     * @param appUuid Uuid of target client.
     */
    public async tryLaunchApplication(appUuid: string): Promise<void> {
        const isRunning = await this._environment.isApplicationRunning(appUuid);
        if (!isRunning) {
            const storedApplication = this._store.state.applications.get(appUuid);
            if (storedApplication) {
                try {
                    await this._environment.startApplication(storedApplication);
                } catch (error) {
                    throw new LaunchApplicationError('Could not launch application', error);
                }
            } else {
                throw new LaunchApplicationError(`Could not find application initialization data for the application with uuid ${appUuid} in the database.`);
            }
        }
    }

    /**
     * Decides whether an app is ready to receive `notification-action` events
     *
     * @param appUuid Uuid of the app.
     */
    public isAppActionReady(appUuid: string): boolean {
        return this._actionReadyWindows.some(client => client.uuid === appUuid);
    }

    public async onAddEventListener(eventType: Events['type'], sender: Identity): Promise<void> {
        if (eventType === 'notification-action') {
            const actionReady = this.isAppActionReady(sender.uuid);

            this._actionReadyWindows.push(sender);

            if (!actionReady) {
                this.onAppActionReady.emit(sender);
            }
        }
    }

    public async onRemoveEventListener(eventType: Events['type'], sender: Identity): Promise<void> {
        if (eventType === 'notification-action') {
            this.removeActiveClient(sender);
        }
    }

    private async onClientConnection(app: Identity): Promise<void> {
        const application: StoredApplication = await this._environment.getApplication(app.uuid);
        await (new RegisterApplication(application)).dispatch(this._store);
    }

    private removeActiveClient(client: Identity): void {
        this._actionReadyWindows = this._actionReadyWindows.filter(activeClient => activeClient.uuid !== client.uuid || activeClient.name !== client.name);
    }
}
