#!/usr/bin/env python3
"""Disposable KC24 H2→PostgreSQL rehearsal. Never attaches existing volumes.

Requires Docker, npm ci, and Playwright Chromium. Run manually on a test host,
not on the memory-constrained production runner. Needs free loopback port 80
(KC24 fixed-hostname mode uses the scheme default port). No production credentials.
"""
import importlib.util, ipaddress, json, pathlib, secrets, subprocess, time, urllib.request, urllib.error, uuid
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('transfer', ROOT/'deploy/whiteboard/keycloak/realm_transfer.py')
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
prefix='kc-rehearsal-'+uuid.uuid4().hex[:8]
folder=pathlib.Path(__import__('tempfile').gettempdir())/prefix;folder.mkdir(mode=0o700)
containers=[]; networks=[]; volumes=[]
def docker(*args):
    try:return subprocess.check_output(['docker',*args],text=True,stderr=subprocess.PIPE).strip()
    except subprocess.CalledProcessError as error:
        (folder/'last-command.log').write_text((error.output or '')+'\n'+(error.stderr or ''));raise
def run(name,*args):
    containers.append(name)
    return docker('run','-d','--name',name,'--label','codex.keycloak-rehearsal='+prefix,*args)
def get(url):
    with urllib.request.urlopen(url,timeout=4) as r:return json.load(r)
def wait(url):
    for i in range(180):
        try:return get(url)
        except (OSError,ValueError):time.sleep(1)
    raise RuntimeError('Readiness timeout: '+url)
def save(name,value):
    p=folder/name;p.write_text(json.dumps(value));p.chmod(0o600);return p
try:
    for name,internal in [(prefix+'-private',True),(prefix+'-gateway',False)]:
        docker('network','create',*(['--internal'] if internal else []),name);networks.append(name)
    private,edge=networks
    volume=prefix+'-source';docker('volume','create',volume);volumes.append(volume)
    password=secrets.token_urlsafe(24)
    env=folder/'env';env.write_text('KEYCLOAK_ADMIN=test-admin\nKEYCLOAK_ADMIN_PASSWORD='+password+'\nJAVA_OPTS_KC_HEAP=-Xms64m -Xmx384m\n');env.chmod(0o600)
    pg=prefix+'-postgres'
    run(pg,'--network',private,'--network-alias','postgres','--memory','256m','--cpus','0.5','-e','POSTGRES_USER=keycloak','-e','POSTGRES_DB=keycloak','-e','POSTGRES_PASSWORD=test-db-only','--tmpfs','/var/lib/postgresql/data:size=256m','postgres:16-alpine')
    run(prefix+'-source','--network',private,'--network-alias','source','--network-alias','whiteboard-keycloak','--memory','768m','--cpus','1','--env-file',str(env),'-e','KC_PROXY_HEADERS=xforwarded','-v',volume+':/opt/keycloak/data','quay.io/keycloak/keycloak:24.0.0','start-dev')
    run(prefix+'-target','--network',private,'--network-alias','workspace-keycloak','--memory','768m','--cpus','1','--env-file',str(env),'-e','KC_HTTP_RELATIVE_PATH=/auth','-e','KC_HOSTNAME=teamspace.kz','-e','KC_HOSTNAME_ADMIN=teamspace.kz','-e','KC_PROXY_HEADERS=xforwarded','-e','KC_DB=postgres','-e','KC_DB_URL=jdbc:postgresql://postgres/keycloak','-e','KC_DB_USERNAME=keycloak','-e','KC_DB_PASSWORD=test-db-only','quay.io/keycloak/keycloak:24.0.0','start-dev')
    # Exercise the actual board frontend nginx routes, including unique DNS names.
    run(prefix+'-backend-dns','--network',private,'--network-alias','backend','--memory','48m','nginx:alpine')
    run(prefix+'-frontend','--network',private,'--network-alias','board-frontend','--memory','48m','-v',str(ROOT/'deploy/whiteboard/source/frontend/nginx.conf')+':/etc/nginx/conf.d/default.conf:ro','nginx:alpine')
    gateway=folder/'gateway.conf'
    def gateway_config(source_enabled=True):
        source_route='proxy_pass http://source:8080/;' if source_enabled else 'return 410;'
        gateway.write_text('events{} http { access_log off; server {listen 8080; location /source/ {'+source_route+'} location /target/ {proxy_pass http://workspace-keycloak:8080/auth/;} location /whiteboard/ {proxy_set_header Host $http_host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-Host $http_host; proxy_pass http://board-frontend:80/;} location /callback {return 200 "callback";} }}')
    gateway_config()
    run(prefix+'-gateway','--network',edge,'-p','127.0.0.1:80:8080','-v',str(gateway)+':/etc/nginx/nginx.conf:ro','nginx:alpine')
    docker('network','connect',private,prefix+'-gateway')
    # nginx may initially lack names until the second network is attached.
    docker('restart',prefix+'-gateway')
    port=json.loads(docker('inspect',prefix+'-gateway'))[0]['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort']
    assert port=='80'
    public='http://127.0.0.1'
    wait(public+'/source/realms/master/.well-known/openid-configuration');wait(public+'/target/realms/master/.well-known/openid-configuration')

    def admin(base):
        for attempt in range(40):
            try:return t.Admin(base,'test-admin',password)
            except RuntimeError:time.sleep(1)
        raise RuntimeError('Bootstrap admin did not become ready')
    source=admin(public+'/source');target=admin(public+'/target')
    target.request('POST','/realms',{'realm':'workspace-sentinel','id':'workspace-sentinel-id','enabled':True})
    sentinel=target.request('GET','/realms/workspace-sentinel')
    realm={'realm':'whiteboard','id':'source-whiteboard-fixed-id','enabled':True,'attributes':{'frontendUrl':public+'/whiteboard'},'roles':{'realm':[{'name':'board-member'}]},'groups':[{'name':'board-team'}], 'clients':[{'clientId':'whiteboard-frontend','id':'original-client-id','publicClient':True,'standardFlowEnabled':True,'directAccessGrantsEnabled':False,'redirectUris':[public+'/callback'],'webOrigins':[public], 'attributes':{'pkce.code.challenge.method':'S256'}}], 'users':[{'id':'original-sub-'+str(i),'username':name,'enabled':True,'emailVerified':True,'email':f'fixture{i}@example.invalid','firstName':'Тест','lastName':'Пользователь','realmRoles':['board-member'],'groups':['board-team'],'credentials':[{'type':'password','value':'Fixture-password-2026!','temporary':False}]} for i,name in enumerate(['fixture.member','fixture.second'])]}
    source.request('POST','/realms',realm)
    discovery=get(public+'/whiteboard/realms/whiteboard/.well-known/openid-configuration');issuer=discovery['issuer'];keys=get(public+'/whiteboard/realms/whiteboard/protocol/openid-connect/certs')
    save('discovery-before.json',discovery)
    before=source.snapshot();save('before.json',before)
    # Obtain a real browser/PKCE token before migration with the normal public client.
    (folder/'public.json').write_text(json.dumps({'base':public,'folder':str(folder),'issuer':issuer}))
    print(json.dumps({'phase':'source-ready','folder':str(folder),'base':public}),flush=True)
    subprocess.run(['node',str(ROOT/'scripts/test-whiteboard-keycloak-pkce.mjs'),str(folder),'before'],check=True,cwd=ROOT)
    docker('stop',prefix+'-source')
    exports=folder/'exports';exports.mkdir(mode=0o777);exports.chmod(0o777)
    # Full CLI export is the supported path that includes password hashes and private signing keys.
    containers.append(prefix+'-export')
    docker('run','--rm','--name',prefix+'-export','--label','codex.keycloak-rehearsal='+prefix,'--network','none','--hostname','localhost','--memory','768m','--cpus','1','--user','0','-e','JAVA_OPTS_KC_HEAP=-Xms64m -Xmx384m','-v',volume+':/opt/keycloak/data','-v',str(exports)+':/exports','quay.io/keycloak/keycloak:24.0.0','export','--db=dev-file','--realm=whiteboard','--dir=/exports','--users=realm_file')
    exported=json.loads((exports/'whiteboard-realm.json').read_text())
    t.import_new(target,exported,issuer)
    t.restore_import_defaults(target,before)
    after=target.snapshot();save('after.json',after)
    t.compare_snapshots(before,after)
    imported=target.request('GET','/realms/whiteboard');imported['enabled']=True;target.request('PUT','/realms/whiteboard',imported)
    bridge=prefix+'-bridge'
    run(bridge,'--network',private,'--network-alias','keycloak','--network-alias','whiteboard-keycloak','--user','101:101','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','48m','--memory-swap','64m','--cpus','0.25','--pids-limit','64','--tmpfs','/tmp:rw,noexec,nosuid,size=8m,mode=1777','--entrypoint','nginx','-v',str(ROOT/'deploy/whiteboard/keycloak/shared-proxy.conf')+':/etc/nginx/nginx.conf:ro','nginx:alpine','-g','daemon off;')
    docker('exec',prefix+'-frontend','nginx','-s','reload')
    gateway_config(False);docker('exec',prefix+'-gateway','nginx','-s','reload')
    afterdiscovery=wait(public+'/whiteboard/realms/whiteboard/.well-known/openid-configuration')
    save('discovery-after.json',afterdiscovery)
    differences={k:[discovery.get(k),afterdiscovery.get(k)] for k in discovery.keys()|afterdiscovery.keys() if discovery.get(k)!=afterdiscovery.get(k)}
    assert not differences, 'OIDC discovery changed: '+json.dumps(differences)
    afterkeys=get(public+'/whiteboard/realms/whiteboard/protocol/openid-connect/certs');assert t.digest(keys)==t.digest(afterkeys),'Signing keys changed'
    subprocess.run(['node',str(ROOT/'scripts/test-whiteboard-keycloak-pkce.mjs'),str(folder),'after'],check=True,cwd=ROOT)
    # Replace the target's network address, as a later Workspace deploy may do.
    subnet=json.loads(docker('network','inspect',private))[0]['IPAM']['Config'][0]['Subnet']
    replacement=str(ipaddress.ip_network(subnet).network_address+230)
    docker('network','disconnect',private,prefix+'-target')
    docker('network','connect','--ip',replacement,'--alias','workspace-keycloak',private,prefix+'-target')
    # A replacement JVM also opens fresh database connections on its new IP.
    docker('restart',prefix+'-target')
    assert wait(public+'/whiteboard/realms/whiteboard/.well-known/openid-configuration')==discovery
    docker('exec',prefix+'-gateway','nginx','-s','reload')
    subprocess.run(['node',str(ROOT/'scripts/test-whiteboard-keycloak-pkce.mjs'),str(folder),'after'],check=True,cwd=ROOT)
    for path in ['/realms/master/.well-known/openid-configuration','/admin/','/realms/workspace-sentinel/.well-known/openid-configuration']:
        try:get(public+'/whiteboard'+path);raise AssertionError('Unexpected route allowed')
        except urllib.error.HTTPError as error:assert error.code==404
    target=admin(public+'/target')
    assert target.request('GET','/realms/workspace-sentinel')==sentinel,'Other realm changed'
    print(json.dumps({'phase':'passed','users':len(before['users']),'issuer_preserved':True,'signing_keys_preserved':True,'other_realm_unchanged':True,'proxy_boundaries_verified':True,'target_ip_change_verified':True}),flush=True)
except Exception:
    # Only synthetic fixture data is logged; never use this harness with production containers.
    for name in containers:
        if name.endswith(('-source','-target','-bridge')):
            try:(folder/(name+'.log')).write_text(subprocess.check_output(['docker','logs',name],text=True,stderr=subprocess.STDOUT))
            except Exception:pass
    raise
finally:
    for name in reversed(containers):
        try:docker('rm','-f',name)
        except Exception:pass
    for name in reversed(networks):
        try:docker('network','rm',name)
        except Exception:pass
    for name in volumes:
        try:docker('volume','rm',name)
        except Exception:pass
