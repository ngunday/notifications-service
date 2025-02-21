import * as React from 'react';
import {CSSTransition, TransitionGroup} from 'react-transition-group';

import {NotificationCard} from '../NotificationCard/NotificationCard';
import {RemoveNotifications} from '../../../store/Actions';
import {CircleButton, Size, IconType} from '../CircleButton/CircleButton';
import {TitledNotification, Actionable} from '../../types';

import './NotificationGroup.scss';

interface Props extends Actionable {
    // Group name
    name: string;
    // Notifications in this group
    notifications: TitledNotification[];
}

export function NotificationGroup(props: Props) {
    const {notifications, storeApi, name} = props;
    const handleClearAll = async () => {
        await new RemoveNotifications(notifications).dispatch(storeApi);
    };

    return (
        <div className="group">
            <div className="title">
                <span className="app">
                    <span className="name single-line">{name}</span>
                    <span className="count">{notifications.length}</span>
                </span>
                <CircleButton type={IconType.CLOSE} size={Size.SMALL} onClick={handleClearAll} alt="Clear notifications" />
            </div>
            <TransitionGroup className="notifications" component="ul">
                {
                    notifications.map((notification) => {
                        return (
                            <CSSTransition
                                key={notification.id + notification.notification.date}
                                timeout={200}
                                classNames="item"
                            >
                                <li key={notification.id + notification.notification.date}>
                                    <NotificationCard notification={notification} storeApi={storeApi} />
                                </li>
                            </CSSTransition>
                        );
                    })
                }
            </TransitionGroup>
        </div>
    );
}
