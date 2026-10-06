"""Disposable native PostgreSQL only. Never connect this runner to Supabase Cloud.

Run after loading the current schema/migrations in an EMPTY customer_debt_test DB:
python3 supabase/tests/isolated/customer_debt_concurrency.py --socket /tmp/.../socket --port 55469
Fixtures remain in this disposable database for inspection; drop it after the audit.
"""
import argparse
import concurrent.futures
import json
import pathlib
import subprocess
import threading
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--socket', required=True)
parser.add_argument('--port', required=True)
args = parser.parse_args()
socket = pathlib.Path(args.socket)
assert socket.is_absolute() and socket.is_dir() and str(socket).startswith('/tmp/tuenhi-customer-debt-')
connection = ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(socket), '-p', args.port, '-d', 'customer_debt_test']
owner = '10000000-0000-4000-8000-000000000001'
customer = '40000000-0000-4000-8000-000000000001'
other = '40000000-0000-4000-8000-000000000002'


def sql(statement, authenticated=False):
    prefix = f"set role authenticated; set request.jwt.claim.sub='{owner}';" if authenticated else ''
    result = subprocess.run(connection + ['-c', prefix + statement], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


assert sql("select current_database()='customer_debt_test' and inet_server_addr() is null;") == 't'
assert sql('select count(*) from api.customers;') == '0', 'Requires an empty disposable fixture database'
# The audit snapshot is schema-only --no-acl. Recreate baseline schema USAGE;
# function-level grants must come from the real migrations being tested.
sql('grant usage on schema api,app_private to authenticated;')
fixture = pathlib.Path(__file__).with_name('customer_debt.sql').read_text()
seed = fixture.split('do $$\ndeclare saved jsonb;')[0].replace('\\set ON_ERROR_STOP on\n', '')
sql(seed + 'commit;')


def rpc(statement):
    return json.loads(sql('select ' + statement + ';', authenticated=True))


def parallel(statements):
    barrier = threading.Barrier(len(statements))
    def run(statement):
        barrier.wait()
        return rpc(statement)
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(statements)) as pool:
        return list(pool.map(run, statements))


def debt(cid=customer):
    response = rpc(f"api.get_customer_debt('{cid}')")
    assert response['ok'], response
    return response['data']


result = rpc(f"api.adjust_customer_debt('{customer}',1,'100000','Opening fixture','{uuid.uuid4()}')")
assert result['ok'], result
key = uuid.uuid4()
request = f"api.collect_customer_debt('{customer}',{debt()['version']},'20000','0','Same key','{key}')"
responses = parallel([request, request])
assert responses[0] == responses[1] and responses[0]['ok'], responses
assert debt()['balance'] == '80000.00'
assert sql(f"select count(*) from app_private.customer_debt_entries where customer_id='{customer}' and kind='COLLECTION';") == '1'

version = debt()['version']
responses = parallel([f"api.collect_customer_debt('{customer}',{version},'60000','0','Competing request','{uuid.uuid4()}')" for _ in range(2)])
assert sum(r['ok'] for r in responses) == 1, responses
assert next(r for r in responses if not r['ok'])['error']['code'] == 'VERSION_CONFLICT'
assert debt()['balance'] == '20000.00'

# Actual invoker-role sale/return/cancel paths, then collection races a return.
saved = rpc(f"api.save_sale_draft(null,null,'{other}','20000000-0000-4000-8000-000000000001','[{{\"productId\":\"30000000-0000-4000-8000-000000000001\",\"quantity\":\"5\",\"lineDiscountAmount\":\"0\",\"lineOrder\":0}}]'::jsonb,'0','Concurrent return','{uuid.uuid4()}')")
assert saved['ok'], saved
sale = saved['data']['sale']
completed = rpc(f"api.complete_sale_with_allocations('{sale['id']}',{sale['version']},'0','0','{uuid.uuid4()}',null)")
assert completed['ok'], completed
line = sql(f"select id from api.sale_lines where sale_id='{sale['id']}';")
requested = rpc(f"api.create_sale_return_request('{sale['id']}','Race return','[{{\"originalSaleLineId\":\"{line}\",\"requestedQty\":\"3\"}}]'::jsonb,'{uuid.uuid4()}')")
assert requested['ok'], requested
returned = requested['data']
return_line = sql(f"select id from api.sale_return_lines where sale_return_id='{returned['returnId']}';")
collection = f"api.collect_customer_debt('{other}',{debt(other)['version']},'20000','0','Race collection','{uuid.uuid4()}')"
return_request = f"api.complete_sale_return('{returned['returnId']}',{returned['version']},'[{{\"saleReturnLineId\":\"{return_line}\",\"acceptedQty\":\"3\"}}]'::jsonb,'CASH','{uuid.uuid4()}',null)"
responses = parallel([collection, return_request])
assert responses[1]['ok'], responses
assert responses[1]['data']['cashRefundAmount'] == '0.00', responses
assert debt(other)['balance'] == ('20000.00' if responses[0]['ok'] else '40000.00'), responses
if not responses[0]['ok']:
    assert responses[0]['error']['code'] == 'VERSION_CONFLICT', responses
assert rpc(return_request) == responses[1]
invoice = rpc(f"api.get_sale_invoice('{sale['id']}')")
assert invoice['ok'], invoice
assert rpc(f"api.get_sale_return('{returned['returnId']}')")['ok']
canceled = rpc(f"api.cancel_sale('{sale['id']}',{completed['data']['version']},'Cancel remainder','{uuid.uuid4()}')")
assert canceled['error']['code'] == 'INVALID_STATE', canceled
balance_before = debt(other)['balance']
saved = rpc(f"api.save_sale_draft(null,null,'{other}','20000000-0000-4000-8000-000000000001','[{{\"productId\":\"30000000-0000-4000-8000-000000000001\",\"quantity\":\"1\",\"lineDiscountAmount\":\"0\",\"lineOrder\":0}}]'::jsonb,'0','Cancellation fixture','{uuid.uuid4()}')")
assert saved['ok'], saved
sale = saved['data']['sale']
completed = rpc(f"api.complete_sale_with_allocations('{sale['id']}',{sale['version']},'0','0','{uuid.uuid4()}',null)")
assert completed['ok'], completed
canceled = rpc(f"api.cancel_sale('{sale['id']}',{completed['data']['version']},'Cancel credit invoice','{uuid.uuid4()}')")
assert canceled['ok'], canceled
assert debt(other)['balance'] == balance_before
assert sql("select not exists(select 1 from app_private.customer_debt_accounts a where a.balance <> a.unallocated_balance + (select coalesce(sum(p.outstanding_amount),0) from app_private.sale_payment_allocations p where p.customer_id=a.customer_id));") == 't'

# A staff user with only own-sale read cannot read or mutate aggregate debt.
staff = '10000000-0000-4000-8000-000000000002'
sql(f"insert into auth.users(id,email) values('{staff}','staff-audit@example.invalid'); insert into api.profiles(id,email,display_name,role_template,must_change_password) values('{staff}','staff-audit@example.invalid','Local staff','SALES_WAREHOUSE',false);")
for request in [f"api.get_customer_debt('{customer}')", f"api.list_customer_debt_entries('{customer}')", f"api.collect_customer_debt('{customer}',1,'1','0','Denied','{uuid.uuid4()}')", f"api.adjust_customer_debt('{customer}',1,'0','Denied','{uuid.uuid4()}')"]:
    result = json.loads(sql(f"set role authenticated; set request.jwt.claim.sub='{staff}'; select {request};"))
    assert result['error']['code'] == 'PERMISSION_DENIED', result
print('PASS: authenticated RPCs, same-key/competing-version collection, return race, cancellation, private debt access')
