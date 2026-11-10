# Alem Drive API guide

All Drive API requests use `https://<server-domain>/api/v1`. The web client authenticates using the Alem Workspace session.

## Open an office file

The web client opens:

```text
/drive/editor/<FILE_ID>
```

For an embedded/mobile WebView, add `?embedded=true`. The frontend loads file metadata when it was not passed from Drive, then opens the backend launch page:

```http
GET /api/v1/drive/collabora/editor?file_id=<FILE_ID>&mode=edit
```

`mode` accepts `edit` or `view`. Backend checks the user's effective Drive permission and downgrades an unauthorized edit request to view mode. The launch page reads Collabora's `/hosting/discovery` and posts the WOPI source and a short-lived, file-scoped access token to Collabora.

## WOPI host endpoints

Collabora calls these endpoints server-to-server using the signed `access_token` issued by Alem Drive:

| Method and path | WOPI operation |
| --- | --- |
| `GET /api/v1/drive/wopi/files/{id}` | `CheckFileInfo` |
| `GET /api/v1/drive/wopi/files/{id}/contents` | `GetFile` |
| `POST /api/v1/drive/wopi/files/{id}` | Lock, refresh, unlock, get lock |
| `POST /api/v1/drive/wopi/files/{id}/contents` with `X-WOPI-Override: PUT` | `PutFile` |

Read/write access is checked again for each file operation. `PutFile` requires the active WOPI lock and writes through the normal Drive versioning and quota path.

## Public office preview

Public shares use the same Collabora editor in read-only mode:

```http
GET /api/v1/public/drive/files/{LINK_TOKEN}/preview/office?resource_type=file&resource_id={FILE_ID}
```

The public link is revalidated on WOPI reads. Its WOPI token cannot write, even when the original link grants edit rights; accepted editor links open the authenticated Drive editor instead.

## Deployment

Set `COLLABORA_URL` on the workspace backend to the public Collabora base URL, for example `https://office.example.com`. The backend must be able to fetch `/hosting/discovery`; browsers must be able to load the returned editor URL and establish Collabora WebSockets. Configure Collabora's WOPI allowlist for the public Alem Drive API host and terminate TLS at the public reverse proxy.

The frontend no longer needs `VITE_ONLYOFFICE_URL` or an OnlyOffice script URL for Alem Drive.
