package com.richangyu.lifeworkbench;
import org.junit.Test;
import static org.junit.Assert.*;
public class WorkbenchManagementPolicyTest {
    private final String id="a1111111-1111-4111-8111-111111111111";
    @Test public void exactEndpointsSeparateReadsAndWrites() {
        for(String section:new String[]{"goal","milestone","account","budget","savings","transaction","transfer"}) {
            String path="/api/mobile-management?section="+section+"&page=0";
            assertTrue(WorkbenchManagementPolicy.endpoint(path));
            assertTrue(WorkbenchClientPolicy.allowsEndpoint(path,false));
            assertFalse(WorkbenchClientPolicy.allowsEndpoint(path,true));
        }
        assertTrue(WorkbenchClientPolicy.allowsEndpoint("/api/mobile-management-actions",true));
        assertFalse(WorkbenchClientPolicy.allowsEndpoint("/api/mobile-management-actions",false));
        for(String path:new String[]{"/api/mobile-management?section=goal&page=-1","/api/mobile-management?section=goal&page=00",
            "/api/mobile-management?section=goal&page=1000","/api/mobile-management?section=goal&page=0&owner=x",
            "/api/mobile-management/?section=goal&page=0","/api/mobile-management-actions?owner=x"})
            assertFalse(WorkbenchClientPolicy.allowsEndpoint(path,false));
    }
    @Test public void formsOnlyAdmitKnownFieldNames() {
        assertEquals(7,WorkbenchManagementPolicy.fieldCount("goal"));assertEquals(5,WorkbenchManagementPolicy.fieldCount("transfer"));
        assertTrue(WorkbenchManagementPolicy.field("goal","progress"));assertFalse(WorkbenchManagementPolicy.field("goal","ownerId"));
        assertFalse(WorkbenchManagementPolicy.field("goal","amount"));assertFalse(WorkbenchManagementPolicy.field("goal","title,kind"));
        assertFalse(WorkbenchManagementPolicy.field("goal",""));
    }
    @Test public void signedAndUnsignedMoneyUseExactCentsWithoutRounding() {
        assertEquals("-12.29",WorkbenchManagementPolicy.decimal("-12.29",true,true));
        assertEquals("0.00",WorkbenchManagementPolicy.decimal("-0.00",true,true));
        assertEquals("1.20",WorkbenchManagementPolicy.decimal("1.2",false,false));
        assertEquals("9999999.99",WorkbenchManagementPolicy.decimal("9999999.99",false,false));
        for(String value:new String[]{"1e2","1.001","01.00","NaN",".5","10000000","-1","0"})
            assertEquals(value,"",WorkbenchManagementPolicy.decimal(value,false,false));
    }
    @Test public void receiptMustBindEntityActionAndRequest() {
        String target="managed-abcdef0123456789-"+id;
        assertTrue(WorkbenchManagementPolicy.result(target,"",id,"manage.create","manage.create","goal","goal","applied",false));
        assertTrue(WorkbenchManagementPolicy.result("old","old",id,"manage.update","manage.update","goal","goal","cancelled",false));
        assertFalse(WorkbenchManagementPolicy.result("other","old",id,"manage.update","manage.update","goal","goal","applied",false));
        assertFalse(WorkbenchManagementPolicy.result(target,"",id,"manage.create","manage.create","account","goal","applied",false));
        assertFalse(WorkbenchManagementPolicy.result(target,"",id.toUpperCase(),"manage.create","manage.create","goal","goal","applied",false));
        assertFalse(WorkbenchManagementPolicy.result(target,"",id,"manage.create","manage.create","goal","goal","not-confirmed",false));
        assertTrue(WorkbenchManagementPolicy.result(target,"",id,"manage.create","manage.create","goal","goal","not-confirmed",true));
    }
    @Test public void responseRejectsWrongOriginOrQueryAndNonJsonMedia() {
        String path="/api/mobile-management?section=goal&page=0",origin="https://example.com";
        assertTrue(WorkbenchManagementPolicy.response(200,"application/json; charset=utf-8",origin+path,origin,path));
        for(String url:new String[]{"https://other.com"+path,origin+path+"#x",origin+path+"&owner=x","https://user@example.com"+path})
            assertFalse(WorkbenchManagementPolicy.response(200,"application/json",url,origin,path));
        assertFalse(WorkbenchManagementPolicy.response(200,"application/jsonx",origin+path,origin,path));
        assertFalse(WorkbenchManagementPolicy.response(302,"application/json",origin+path,origin,path));
    }
    @Test public void financialSectionsAreNotGoalSections() {
        assertFalse(WorkbenchManagementPolicy.financial("goal"));assertFalse(WorkbenchManagementPolicy.financial("milestone"));
        assertTrue(WorkbenchManagementPolicy.financial("account"));assertTrue(WorkbenchManagementPolicy.financial("transaction"));
        assertFalse(WorkbenchManagementPolicy.section("vault"));
    }
}
