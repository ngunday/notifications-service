import {injectable, inject} from 'inversify';

import {Inject} from '../common/Injectables';
import {Transport, Targeted} from '../../client/EventRouter';
import {NotificationActionEvent, NotificationClosedEvent, NotificationCreatedEvent} from '../../client';
import {RootState, mutable} from '../store/State';
import {CreateNotification, RemoveNotifications, ClickButton, ClickNotification, ExpireNotification} from '../store/Actions';
import {Action} from '../store/Store';
import {ActionTrigger} from '../../client/actions';
import {StoredNotification} from '../model/StoredNotification';
import {EventPump} from '../model/EventPump';
import {ServiceStore} from '../store/ServiceStore';
import {LaunchApplicationError} from '../model/Errors';

/**
 * Translates store actions to events to be dispatched to the client.
 */
@injectable()
export class ClientEventController {
    constructor(
        @inject(Inject.EVENT_PUMP) eventPump: EventPump,
        @inject(Inject.STORE) store: ServiceStore
    ) {
        store.onAction.add(async (action: Action<RootState>): Promise<void> => {
            if (action instanceof CreateNotification) {
                const {notification, source} = action.notification;
                const event: Targeted<Transport<NotificationCreatedEvent>> = {
                    target: 'default',
                    type: 'notification-created',
                    notification: mutable(notification)
                };
                await eventPump.push<NotificationCreatedEvent>(source.uuid, event);
            } else if (action instanceof RemoveNotifications) {
                const {notifications} = action;
                await Promise.all(notifications.map(async (storedNotification: StoredNotification) => {
                    const {notification, source} = storedNotification;
                    if (notification.onClose !== null) {
                        const actionEvent: Targeted<Transport<NotificationActionEvent>> = {
                            target: 'default',
                            type: 'notification-action',
                            trigger: ActionTrigger.CLOSE,
                            notification: mutable(notification),
                            result: notification.onClose
                        };
                        await eventPump.push<NotificationActionEvent>(source.uuid, actionEvent);
                    }
                    const closedEvent: Targeted<Transport<NotificationClosedEvent>> = {
                        target: 'default',
                        type: 'notification-closed',
                        notification: mutable(notification)
                    };
                    await eventPump.push<NotificationClosedEvent>(source.uuid, closedEvent);
                }));
            } else if (action instanceof ClickButton) {
                const {notification, source} = action.notification;
                const button = notification.buttons[action.buttonIndex];
                if (button.onClick !== null) {
                    const event: Targeted<Transport<NotificationActionEvent>> = {
                        target: 'default',
                        type: 'notification-action',
                        trigger: ActionTrigger.CONTROL,
                        notification: mutable(notification),
                        controlSource: 'buttons',
                        controlIndex: action.buttonIndex,
                        result: button.onClick
                    };
                    await eventPump.push<NotificationActionEvent>(source.uuid, event);
                }
            } else if (action instanceof ClickNotification) {
                const {notification, source} = action.notification;

                if (notification.onSelect !== null) {
                    const event: Targeted<Transport<NotificationActionEvent>> = {
                        target: 'default',
                        type: 'notification-action',
                        trigger: ActionTrigger.SELECT,
                        notification: mutable(notification),
                        result: notification.onSelect
                    };
                    await eventPump.push<NotificationActionEvent>(source.uuid, event);
                }
            } else if (action instanceof ExpireNotification) {
                const {notification, source} = action.notification;

                if (notification.onExpire !== null) {
                    const event: Targeted<Transport<NotificationActionEvent>> = {
                        target: 'default',
                        type: 'notification-action',
                        trigger: ActionTrigger.EXPIRE,
                        notification: mutable(notification),
                        result: notification.onExpire
                    };
                    await eventPump.push<NotificationActionEvent>(source.uuid, event);
                }
            }
        });
    }
}
