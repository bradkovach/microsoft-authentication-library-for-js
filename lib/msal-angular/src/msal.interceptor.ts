import { Injectable } from '@angular/core';
import {
    HttpRequest,
    HttpHandler,
    HttpEvent,
    HttpInterceptor, HttpErrorResponse
} from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/fromPromise';
import 'rxjs/add/operator/mergeMap'
import {MsalService} from "./msal.service";
import {BroadcastService} from "./broadcast.service";
import {MSALError} from "./MSALError";

@Injectable()
export class MsalInterceptor implements HttpInterceptor {
    constructor(private auth: MsalService ,  private broadcastService: BroadcastService) {}

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        const scopes = this.auth.getScopesForEndpoint(req.url);
        this.auth.getLogger().verbose('Url: ' + req.url + ' maps to scopes: ' + scopes);

        // If there are no scopes set for this request, do nothing.
        if (!scopes) {
            return next.handle(req);
        }

        // Acquire a token for this request, and attach as proper auth header.
        return Observable.fromPromise(
            this.auth.acquireTokenSilent({ scopes })
                .then(token => {
                    const authHeader = `Bearer ${token.accessToken}`;
                    return req.clone({
                        setHeaders: {
                            Authorization: authHeader,
                        }
                    });
                })
        ).mergeMap(nextReq => {
            // Call next handler, and if that errors, broadcast error
            return next.handle(nextReq).do(
                event => {},
                err => {
                    if (err instanceof HttpErrorResponse && err.status == 401) {
                        const accessToken = nextReq.headers.get("Authorization").split(" ")[1];
                        this.auth.clearCacheForScope(accessToken);
                        this.broadcastService.broadcast('msal:notAuthorized', err.message);
                    }
                })
            }
        );
    }
}
