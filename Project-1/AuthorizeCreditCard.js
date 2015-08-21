/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       20 Nov 2013     athira
 *
 */

/**
 * @param {nlobjRequest}
 *            request Request object
 * @param {nlobjResponse}
 *            response Response object
 * @returns {Void} Any output is written via response object
 */
function suitelet(request, response) {
	var reasonCode1 = '';
	var cashSaleFlag = false;

	nlapiLogExecution('DEBUG', 'Entered AuthorizeCreditCard');

	var cardType = request.getParameter('cctype');
	var cardNum = request.getParameter('ccnumber');
	var expMonth = request.getParameter('expmonth');
	var expYear = request.getParameter('expyear');
	var zip = request.getParameter('cardzip');
	var name = request.getParameter('nameoncard');
	var customerId = request.getParameter('customer');

	var itemId = request.getParameter('itemid');
	nlapiLogExecution('debug', 'itemId', itemId);
	
//	itemId = 79635;

	nlapiLogExecution('DEBUG','Params','customerId='+customerId);
			// '+cardNum+', expMonth= '+expMonth+', expYear= '+expYear+', zip= '+zip+',
			// name='+name);
	// nlapiLogExecution('DEBUG','Params','cardType='+cardType+', cardNum=
	// '+cardNum+', expMonth= '+expMonth+', expYear= '+expYear+', zip= '+zip+',
	// name='+name);

	try {
		var headers = {};
		headers['Accept'] = 'application/soap+xml,application/json, application/dime, multipart/related, text/*';
		headers['Content-Type'] = 'application/x-www-form-urlencoded';
		
		//Get item details
		var itemDetailsUrl = nlapiResolveURL('SUITELET', 'customscript_item_details', 'customdeploy1', true);
		
		itemDetailsUrl += '&itemid='+itemId+'&page=subscription';
		
		nlapiLogExecution('DEBUG','itemDetailsUrl ',itemDetailsUrl);
		
		var itemDetails = nlapiRequestURL(itemDetailsUrl,null,headers);
		itemDetails = itemDetails.getBody();
		
		itemDetails = eval('(' + itemDetails + ')');
		
		if(itemDetails != null && itemDetails != '') {
			nlapiLogExecution('DEBUG','Online price is '+itemDetails.columns.onlineprice);
			
			if(itemDetails.columns.hasOwnProperty('onlineprice')) {
				var amt = itemDetails.columns.onlineprice;
			} 
			var tempPrice = '';
			if(itemDetails.columns.hasOwnProperty('custitem_membership_tempreducedprice')) {
				tempPrice = itemDetails.columns.custitem_membership_tempreducedprice;
			}
			if(tempPrice != null && tempPrice != '') {
				amt = tempPrice;
			}
		}
		var price = amt;
		
		
		//Creating the CashSale Added By Sanket
		var trialDays = nlapiLookupField('item', itemId, 'custitem_membership_trialdays');
		var role = nlapiLookupField('customer', customerId, 'custentity_role');
		
		/*nlapiLogExecution('debug', 'trialDays', trialDays);
		nlapiLogExecution('debug', 'role', role);
		nlapiLogExecution('debug', '(trialDays == 0 && role == 2)', (trialDays == 0 && role == 2));*/
		
		if(trialDays == 0 || role == 2){
			
			nlapiLogExecution('DEBUG', 'Adding card to customer ' + customerId);

			var ccExpireDate = expMonth + '/' + expYear;

			// First, save card in customer.
			var customer = nlapiLoadRecord('customer', customerId);
			var creditCardCount = customer.getLineItemCount('creditcards');
			customer.selectNewLineItem('creditcards');

			//customer.setCurrentLineItemValue('creditcards', 'ccdefault', 'T');
			customer.setCurrentLineItemValue('creditcards', 'ccexpiredate',ccExpireDate);
			customer.setCurrentLineItemValue('creditcards', 'ccname', name);
			customer.setCurrentLineItemValue('creditcards', 'ccnumber', cardNum);
			customer.setCurrentLineItemValue('creditcards', 'paymentmethod',cardType);
			customer.commitLineItem('creditcards');
			
			// Set zip code in the customer.
			customer.selectNewLineItem('addressbook');
			customer.setCurrentLineItemValue('addressbook', 'zip', zip);
			customer.commitLineItem('addressbook');

			var custId = nlapiSubmitRecord(customer, true, true);

			nlapiLogExecution('DEBUG', 'Added card to customer ' + custId);
			
			
			var filters = new Array();
			filters[filters.length] = new nlobjSearchFilter('internalid', null,'is', customerId);
			var columns1 = new Array();

			// Sort card internal IDs in descending order to get latest first
			columns1[columns1.length] = new nlobjSearchColumn('ccinternalid').setSort(true);
			var customerResult = nlapiSearchRecord('customer', null, filters,columns1);
			
			//Creating the cash sale
			var cashSale = nlapiTransformRecord('customer', customerId,'cashsale');

			if (customerResult != null) {
				nlapiLogExecution('DEBUG', 'Found customer');
				var ccInternalId = customerResult[0].getValue('ccinternalid');
                                nlapiLogExecution('DEBUG', 'Customer is ' + customerId);
				nlapiLogExecution('DEBUG', 'Card ID is ' + ccInternalId);
				cashSale.setFieldValue('creditcard', ccInternalId);
			}
			
			cashSale.setFieldValue('subsidiary', 1);
			cashSale.setFieldValue('cczipcode', zip);
			cashSale.setFieldValue('chargeit', 'T');
			//cashSale.setFieldValue('ccapproved', 'T');
			cashSale.setFieldValue('undepfunds', 'F');
			cashSale.setFieldValue('account', '1965');
			cashSale.setFieldValue('location', '24');
			
			cashSale.selectNewLineItem('item');
			cashSale.setCurrentLineItemValue('item', 'item', itemId);
			cashSale.setCurrentLineItemValue('item', 'quantity', 1);
			cashSale.setCurrentLineItemValue('item', 'rate', price);
			cashSale.setCurrentLineItemValue('item', 'amount', price);
			cashSale.commitLineItem('item');
			cashSale.setFieldValue('custbody_totalqty', 1);
			cashSale.setFieldValue('custbody_linecount', 1);
			
			try{
				cashSale.setFieldValue('ignoreavs', 'T');
			}catch (err) {
				nlapiLogExecution('ERROR', 'Ignore AVS', '\nError while setting ignoreavs in cash sale .NetSuite said: '+ err.message);
			}
			
			try{
				cashSale = nlapiSubmitRecord(cashSale, true, true);
				cashSaleFlag = true;
				nlapiLogExecution('Debug', 'cashSale', cashSale);
			}catch(cashsaleError){
				cashSaleFlag = false;
				nlapiLogExecution('ERROR', 'Cash Sale ', 'Error while creating in cash sale .NetSuite said: '+ cashsaleError);
				if(creditCardCount >= 0 ){
					var customer = nlapiLoadRecord('customer', customerId);
					customer.removeLineItem('creditcards', creditCardCount+1);
					var custId = nlapiSubmitRecord(customer, true, true);

					nlapiLogExecution('DEBUG', 'Removed card to customer Because CashSale Creation is failed' + custId);
				}
			}
			
		}//End Sanket
		else{
			// Live cybersource keys
			/*var URL = 'https://ics2ws.ic3.com/commerce/1.x/transactionProcessor';
			var SECURITY_KEY = 'It/yDbvrXujLk++YdGcRNh8zPBh790kV28xxY9+pS8FktUGvnA+vVowweoqZ2U5RNOCRojY2CY4rfgDUowsXkK3PJSh+PHDmbEQ944WNNlNwSrha/vAhUASxNI/xovwELYhgYcow5nnjNqQs/ROfe/WisBPSjg/dStdJMttETKE5Mw462EyhtrrRCSwoiX7NGmJFahzHo1AbvGmubgezw6xnpJEWsw181QSymFhMFH/NkClRL+anejoFQgzZwmPXvs2iUSd65SaTb7tymsu7f6y4Cw0FDZRPAmpANDUzQ6xmMsy+79i6tCkwSeaL/aGhV+BQJSXif2yqWhMhxG8uRA==';
			var MERCHANT_ID = 'funimation';*/
			
			
			// sandbox cybersource keys
			var URL = 'https://ics2wstest.ic3.com/commerce/1.x/transactionProcessor';
			//var SECURITY_KEY = 'bvctIzKUwME0dKoA1RZ7NlA1qzDuZJ1MAINwS6p/D9MUcHMB5A2S7FIawZaj/bbKEcXWYC61TlwgSAvWNAd4Vz8wyG6kWSD23RpFoxbsybljkU0hPk+ZfkGCZE6xpxgeogt/sBL8369LUXpyXoKn32SakdpJDdZgoqIw9PUSiIEH7JV1qhbtq2AjKGPib/uhujwSXKkVKQIubbejySYxHycTlvNOSVqY3FQ2jBRTFvBnZJuZRrFyPdmHWsajS1Wt+81qZMOlXhierzPvqtTtIXKizqU2LbHgsymW7zfxrhz1f7kgzXKeXjXz/3OkjzNjJoCb27y2r7/NkaiwbpxGpQ==';
			var MERCHANT_ID = 'funimation';
			var SECURITY_KEY = 'Ix8PKot1IJhddy7ljRky5UYoksdDkoxPmmWrppLJfUKy4+B7oHgMzfG9scpky2d2fhbEg9JxbRcyPUv4QGNcy0IjVP/A7s0Q1Gg8kyimA0Z93Lk/8/jZ4KSkCsyuGbL5Ih3PTJNm7WNEdbO3EUvC7zdOJEPbVDN2f3Htzzj1L+7llmf0Mf97MOC0No3GG7CYyUvqUSTrPl+jURePLCwx3/oF6WSEVwAuwS5HxyY5j3VRIckVO/ujFqizmEE87y3YqIZZYOVtSkh6XN9642sMlFH9fvJIPVzGO9nsfnFR/hkg19vNF8fV8LQYippMaYcNqEywBRkM8RE4giCqEG9alQ==';
			
			var soap = '<?xml version="1.0" encoding="UTF-8"?>'
					+ '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">'
					+ '<soapenv:Header>'
					+ '<wsse:Security soapenv:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/'
					+ 'wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">'
					+ '<wsse:UsernameToken>' + '<wsse:Username>'
					+ MERCHANT_ID
					+ '</wsse:Username>'
					+ '<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wssusername-token-profile-1.0#PasswordText"><![CDATA['
					+ SECURITY_KEY
					+ ']]></wsse:Password>'
					+ '</wsse:UsernameToken>'
					+ '</wsse:Security>'
					+ '</soapenv:Header>'
					+ '<soapenv:Body>'
					+ '<requestMessage xmlns="urn:schemas-cybersource-com:transaction-data-1.80">'
					+ '<merchantID>'
					+ MERCHANT_ID
					+ '</merchantID>'
					+ '<merchantReferenceCode>funimation</merchantReferenceCode>'
					+ '<billTo>'
					+ '<firstName>'
					+ name
					+ '</firstName>'
					+ '<lastName>'
					+ name
					+ '</lastName>'
					+ '<street1>street</street1>'
					+ '<city>city</city>'
					+ '<state>TX</state>'
					+ '<postalCode>'
					+ zip
					+ '</postalCode>'
					+ '<country>US</country>'
					+ '<email>cardauth@funimation.com</email>'
					+ '</billTo>'
					+ '<item id="0">'
					+
					// '<unitPrice>1.00</unitPrice>'+
					'<unitPrice>0.01</unitPrice>'
					+ '<quantity>1</quantity>'
					+ '</item>'
					+ '<purchaseTotals>'
					+ '<currency>USD</currency>'
					+ '</purchaseTotals>'
					+ '<card>'
					+ '<accountNumber>'
					+ cardNum
					+ '</accountNumber>'
					+ '<expirationMonth>'
					+ expMonth
					+ '</expirationMonth>'
					+ '<expirationYear>'
					+ expYear
					+ '</expirationYear>'
					+ '</card>'
					+ '<ccAuthService run="true"/>'
					+ '</requestMessage>'
					+ '</soapenv:Body>' + '</soapenv:Envelope>';

			var a = {};
			a['Accept'] = 'application/soap+xml, application/dime, multipart/related, text/*';

			nlapiLogExecution('DEBUG', 'Ready to call cybersource', soap);
			var responseFromCybersource = nlapiRequestURL(URL, soap, a);

			var bodyFromCybersource = responseFromCybersource.getBody();

			nlapiLogExecution('DEBUG', 'bodyFromCybersource', bodyFromCybersource);
			bodyFromCybersource = decodeURIComponent(bodyFromCybersource);

			var reasonCodeStart = bodyFromCybersource.indexOf('<c:reasonCode>');
			var reasonCodeEnd = bodyFromCybersource.indexOf('</c:reasonCode>');
			var decisionStart = bodyFromCybersource.indexOf('<c:decision>');
			var decisionEnd = bodyFromCybersource.indexOf('</c:decision>');

			var reasonCode = bodyFromCybersource.substring(reasonCodeStart,
					reasonCodeEnd);
			reasonCode1 = reasonCode.split('>');

			nlapiLogExecution('DEBUG', 'reasonCode', reasonCode);
			nlapiLogExecution('DEBUG', 'reasonCode1', reasonCode1[1]);

			var decision = bodyFromCybersource
					.substring(decisionStart, decisionEnd);
			var decision1 = decision.split('>');

			var ccAuthResponse = decision1[1] + '*' + reasonCode1[1];
			// response.write(ccAuthResponse);
			
		}
		
		

		// If auth is success, create SO and save card details.
		if (reasonCode1[1] == 100 || cashSaleFlag == true) {
			
			
			//Not Adding the CreditCard because alreday added the CreditCredit in CashSale Creation Conditon in above line 79
			if(trialDays != 0 && role != 2){
				nlapiLogExecution('DEBUG', 'Adding card to customer ' + customerId);

				var ccExpireDate = expMonth + '/' + expYear;

				// First, save card in customer.
				var customer = nlapiLoadRecord('customer', customerId);

				customer.selectNewLineItem('creditcards');

				//customer.setCurrentLineItemValue('creditcards', 'ccdefault', 'T');
				customer.setCurrentLineItemValue('creditcards', 'ccexpiredate',ccExpireDate);
				customer.setCurrentLineItemValue('creditcards', 'ccname', name);
				customer.setCurrentLineItemValue('creditcards', 'ccnumber', cardNum);
				customer.setCurrentLineItemValue('creditcards', 'paymentmethod',cardType);
				customer.commitLineItem('creditcards');
				
				// Set zip code in the customer.
				customer.selectNewLineItem('addressbook');
				customer.setCurrentLineItemValue('addressbook', 'zip', zip);
				customer.commitLineItem('addressbook');

				var custId = nlapiSubmitRecord(customer, true, true);

				nlapiLogExecution('DEBUG', 'Added card to customer ' + custId);
				
			}
			


			// Call suitelet to create the sales order.			
			
			/*Alicia Requested this changes on 06/April/2015
			 * createSalesOrder() function is created to combine "CreateSubscriptionOrder" in same script
			 * to increase the execution script
			 * Both script logic is combined in one script and this function is only for credit card user*/
			
			var soid = createSalesOrder(itemId, price, 'T' , customerId);
			
			nlapiLogExecution('DEBUG', 'SOID From suitelet',soid);
			
			if (soid != '' && soid != 'undefined') {
				//Production URL
				//var redirectUrl = 'http://shop.funimation.com/Shop/ThankYou.html';
				
				//Sandbox URL
				var redirectUrl = 'http://shopping.sandbox.netsuite.com/c.3335099/SSP%20Applications/FUNimation/Shop/ThankYou.html';
                                 var params = new Array();
                                 params['order'] = soid;
                                 params['item'] = itemId;
                                 params['p'] = price;
				nlapiSetRedirectURL('EXTERNAL', redirectUrl, null, null, params);
			} else {
				//Production URL
				//var errorUrl = 'https://checkout.netsuite.com/c.3335099/Shop/Payment.ss?itemid='+itemId+'&error=2';
				
				//Sandbox URL
				var errorUrl = 'https://checkout.sandbox.netsuite.com/c.3335099/Shop/Payment.ss?itemid='+itemId+'&error=2';
				nlapiSetRedirectURL('EXTERNAL', errorUrl, null, null, null);
			}

		} else {
			nlapiLogExecution('DEBUG', 'Not adding card to customer '+ customerId + '. Returning to Payment.ss.');
			
			//Production URL
			//var errorUrl = 'https://checkout.netsuite.com/c.3335099/Shop/Payment.ss?itemid='+itemId+'&error=3';
			
			//Sandbox URL
			var errorUrl = 'https://checkout.sandbox.netsuite.com/c.3335099/Shop/Payment.ss?itemid='+itemId+'&error=3';
			nlapiSetRedirectURL('EXTERNAL', errorUrl, null, null, null);
		}
	} catch (e) {

		nlapiLogExecution('ERROR', 'An exception occured', e);
		//Production URL
		//var errorUrl = 'https://checkout.netsuite.com/c.3335099/Shop/Payment.ss?itemid='+itemId+'&error=3';
		
		//Sandbox URL
		var errorUrl = 'https://checkout.sandbox.netsuite.com/c.3335099/Shop/Payment.ss?itemid='+itemId+'&error=3';
		
		nlapiSetRedirectURL('EXTERNAL', errorUrl, null, null, null);
	}
	nlapiLogExecution('AUDIT', 'Subscription Script','Usage left('+ nlapiGetContext().getRemainingUsage()+ ') .');

}





//Function to Creates a Sales Order on successful completion of a subscription purchase.
function createSalesOrder(itemInternalId, itemPrice,iscc , customerInternalId) {

	nlapiLogExecution('DEBUG','Entered create SO');
	var itemId = itemInternalId;
	var price = itemPrice;
	var recurringProfileId = null;
	var customerId = customerInternalId;
	
	nlapiLogExecution('DEBUG',customerId);
	
	var isCC = iscc;

	if (isCC != 'T') {
		isCc = false;
	} else {
		isCc = true;
	}

	nlapiLogExecution('DEBUG','IsCc is'+isCc);
	
	var strName = '';
	var soid = '';
	var cond = 'pass';
	try {
		var record = nlapiCreateRecord('salesorder');
		record.setFieldValue('customform', 137);
		record.setFieldValue('entity', customerId);
		record.setFieldValue('custbody_created_frm_website', 'T');
                record.setFieldValue('subsidiary', 1);
		if (isCc == false) {
			record.setFieldValue('paymentmethod', 11);
		} else {

			var filters = new Array();
			filters[filters.length] = new nlobjSearchFilter('internalid', null,
					'is', customerId);
			var columns = new Array();

			// Sort card internal IDs in descending order to get latest first
			columns[columns.length] = new nlobjSearchColumn('ccinternalid')
					.setSort(true);
			var customerResult = nlapiSearchRecord('customer', null, filters,
					columns);

			if (customerResult != null) {
				nlapiLogExecution('DEBUG', 'Found customer');
				var ccInternalId = customerResult[0].getValue('ccinternalid');

				nlapiLogExecution('DEBUG', 'Card ID is ' + ccInternalId);

				record.setFieldValue('creditcard', ccInternalId);
			}
		}
		record.selectNewLineItem('item');

		record.setCurrentLineItemValue('item', 'item', itemId);
		record.setCurrentLineItemValue('item', 'custcol_rec_profile_id',
				recurringProfileId);

		record.setCurrentLineItemValue('item', 'quantity', 1);

		record.setCurrentLineItemValue('item', 'rate', price);

		record.setCurrentLineItemValue('item', 'amount', price);

		record.commitLineItem('item');
		record.setFieldValue('shipmethod', '');
		var orderno = '';
		//if (cond == 'pass') {

			strName += 'Salesorder is created successfully';

			try{
			soid = nlapiSubmitRecord(record, true, true);
			 nlapiLogExecution('Debug', 'soid', soid);
			}catch(e) {
				//Sending the Email TO ALicia when SO Creation Failed
				var custEmail = nlapiLookupField('customer', customerId, 'email');
				var soFailedSubject = "Sales Order Creation Failed";
				var soFailedBody = "";
				soFailedBody += "Sales Order creation failed for customer "+customerId +"/"+custEmail+".<BR>";
				soFailedBody += "Recurring profile number is "+recurringProfileId+".<BR>";
				soFailedBody += "Error "+e+"<BR>";
				
				nlapiSendEmail('8665', 'Alicia.Lamb@group1200.com',soFailedSubject , soFailedBody, null, null, null, null);
				
				if (e instanceof nlobjError)
					nlapiLogExecution('ERROR', 'system error', e.getCode() + '\n'
							+ e.getDetails());
				else
					nlapiLogExecution('ERROR', 'unexpected error', e.toString());
				
				//Production URL
				//var errorUrl = 'https://checkout.netsuite.com/Shop/Payment.ss?itemid='+itemId+'&error=6';
				
				//Sandbox URL
				var errorUrl = 'https://checkout.sandbox.netsuite.com/c.3335099/Shop/Payment.ss?itemid='+itemId+'&error=6';
				
				if (isCC != 'T') {
					//Production URL
					//errorUrl = 'https://checkout.netsuite.com/Shop/Payment.ss?itemid='+itemId+'&error=2';
					
					//Sandbox URL
					var errorUrl = 'https://checkout.sandbox.netsuite.com/c.3335099/Shop/Payment.ss?itemid='+itemId+'&error=2';
				}
					
				
				nlapiSetRedirectURL('EXTERNAL', errorUrl, null, null, null);
			}

			// Call Function to update Royalty Amounts and other field in SO
			var res = CallASAFunctionality(soid);
			if (res == 'yes') {
				nlapiLogExecution('ERROR', 'User event after submit',
						'SO is updated.');
			} else {
				nlapiLogExecution('ERROR', 'User event after submit',
						'SO is not updated.');
			}

			if (soid != null && soid != '') {

				var SORec = nlapiLoadRecord('salesorder', soid);
				var memo = SORec.getFieldValue('memo');
				var customerid = SORec.getFieldValue('entity');
				var soTranId = SORec.getFieldValue('tranid');

				var subject = 'Your FUNimation.com order no.' + memo
						+ ' has been received';

				// calling a function to get the content of the email
				var emailTemplId = createEmailTemplate(soid);
				// nlapiLogExecution('debug', 'SOCreation', 'emailTemplId = ' +
				// emailTemplId);

				// sending an email to the customer after so is created
				var custRec = nlapiLoadRecord('customer', customerid);
				var email = custRec.getFieldValue('email');
				// nlapiLogExecution('debug', 'SOCreation', 'Email = ' + email);

				if (email != null && email != '') {
					nlapiLogExecution('ERROR', 'SOCreation',
							'Sending email........');

			//		nlapiSendEmail('8665', email, subject, emailTemplId, null,
				//			null, null, null);// to send email, 8665-
					// funimationstore

				}
			}

		/*} else {

			strName += 'Sales Order is not Created';
		}
*/
	} catch (e) {
		if (e instanceof nlobjError)
			nlapiLogExecution('ERROR', 'system error', e.getCode() + '\n'
					+ e.getDetails());
		else
			nlapiLogExecution('ERROR', 'unexpected error', e.toString());

		//Production URL
		//var errorUrl = 'https://checkout.netsuite.com/Shop/Payment.ss?itemid='+itemId+'&error=6';
		
		//Sandbox URL
		var errorUrl = 'https://checkout.sandbox.netsuite.com/c.3335099/Shop/Payment.ss?itemid='+itemId+'&error=6';
		
		if (isCC != 'T') {
			//Production URL
			//errorUrl = 'https://checkout.netsuite.com/Shop/Payment.ss?itemid='+itemId+'&error=2';
			
			//Sandbox URL
			var errorUrl = 'https://checkout.sandbox.netsuite.com/c.3335099/Shop/Payment.ss?itemid='+itemId+'&error=2';
		}
		nlapiSetRedirectURL('EXTERNAL', errorUrl, null, null, null);

	}
	nlapiLogExecution('DEBUG','Created SO '+memo);
	
	// response.write(strName);
	//response.write(memo);
	return memo;

}

function CallASAFunctionality(SOID) {

	var soid = SOID;
	var soflag = 'no';

	var so = nlapiLoadRecord('salesorder', soid);

	// setting the PO#
	var prtranid = so.getFieldValue('tranid');
	var customerid = so.getFieldValue('entity');
	var custRec = nlapiLoadRecord('customer', customerid);
	var customer_ID = custRec.getFieldValue('entityid');
	var email = custRec.getFieldValue('email');
	// nlapiLogExecution('Debug', 'email', email);

	var ponum = customer_ID + '_' + prtranid;
	// nlapiSubmitField('salesorder', prid, 'otherrefnum', ponum);
	so.setFieldValue('otherrefnum', ponum);
	so.setFieldText('orderstatus', 'Pending Fulfillment');

	var memoPrefix = Math.floor((Math.random() * 999) + 100);
	memo = memoPrefix + '-' + prtranid;
	so.setFieldValue('memo', memo);

	var promoCode = so.getFieldValue('promocode');

	// nlapiLogExecution('Debug', 'soid', soid);

	if (promoCode != null && promoCode != '') {
		var promoColumns = new Array();
		promoColumns[0] = new nlobjSearchColumn(
				'custrecord_advpromo_discount_type',
				'custrecord_advpromo_poffer_discount');
		promoColumns[1] = new nlobjSearchColumn(
				'custrecord_advpromo_discount_iatype',
				'custrecord_advpromo_poffer_discount');
		promoColumns[2] = new nlobjSearchColumn(
				'custrecord_advpromo_discount_promo_code',
				'custrecord_advpromo_poffer_discount');
		promoColumns[3] = new nlobjSearchColumn(
				'custrecord_advpromo_discount_iid',
				'custrecord_advpromo_poffer_discount');

		var promoFilters = [ new nlobjSearchFilter(
				'custrecord_advpromo_discount_promo_code',
				'custrecord_advpromo_poffer_discount', 'anyof', promoCode) ];
		var promo = nlapiSearchRecord(
				'customrecord_advpromo_promotional_offer', null, promoFilters,
				promoColumns);

		var eligibleFilter = [ new nlobjSearchFilter(
				'custrecord_advpromo_order_promo_code', null, 'anyof',
				promoCode) ];
		var eligibleOrder = new Array();
		eligibleOrder[0] = new nlobjSearchColumn(
				'custrecord_advpromo_order_iid');

		var eligiblePromo = nlapiSearchRecord(
				'customrecord_advpromo_eligible_order', null, eligibleFilter,
				eligibleOrder);
		var itemX = null;
		if (eligiblePromo != null) {
			itemX = eligiblePromo[0].getValue('custrecord_advpromo_order_iid');
		}

		var promoType = null;
		var itemY = null;
		if (promo != null) {
			itemY = promo[0].getValue('custrecord_advpromo_order_iid',
					'custrecord_advpromo_poffer_discount');
			promoType = promo[0].getValue(
					'custrecord_advpromo_discount_iatype',
					'custrecord_advpromo_poffer_discount');
		}

		var preDiscountTotal = parseFloat(so.getFieldValue('subtotal'))
				+ parseFloat(so.getFieldValue('altshippingcost'));

		var postDiscountTotal = parseFloat(so.getFieldValue('total'));

		// var items = so.getAllLineItemFields('item');
		var numItems = so.getLineItemCount('item');

		for ( var lineItemIndex = 1; lineItemIndex <= numItems; lineItemIndex++) {
			var itemAmount = parseFloat(so.getLineItemValue('item', 'amount',
					lineItemIndex));
			var itemCode = so.getLineItemValue('item', 'item', lineItemIndex);
			var ASA = itemAmount;
			// if promo is of type Buy X, get Y
			if (promoType == '1') {
				if (itemCode == itemX || itemCode == itemY) {
					ASA = (itemAmount / preDiscountTotal) * postDiscountTotal;
				}
			}

			// load the item and get upc code
			var upcCode = '';
			var itemfilter = new Array();
			itemfilter[0] = new nlobjSearchFilter('internalid', null, 'anyof',
					itemCode);
			var itemCol = new Array();
			itemCol[0] = new nlobjSearchColumn('upccode');
			var itemResult = nlapiSearchRecord('item', null, itemfilter,
					itemCol);
			if (itemResult != null && itemResult != '') {
				var itemType = itemResult[0].getRecordType();

				upcCode = itemResult[0].getValue('upccode');

			}

			so.setLineItemValue('item', 'custcol_return_royalty_amount',
					lineItemIndex, ASA);
			so.setLineItemValue('item', 'custcolpurchaseorder_upc',
					lineItemIndex, upcCode);
			// prec.setCurrentLineItemValue('item','custcolpurchaseorder_upc',upcCode);

			so.commitLineItem('item');

		}

	} else {

		var numItems = so.getLineItemCount('item');
		for ( var lineItemIndex = 1; lineItemIndex <= numItems; lineItemIndex++) {
			var itemAmount = parseFloat(so.getLineItemValue('item', 'amount',
					lineItemIndex));
			var itemCode = so.getLineItemValue('item', 'item', lineItemIndex);
			var ASA = itemAmount;

			var upcCode = '';
			var itemfilter = new Array();
			itemfilter[0] = new nlobjSearchFilter('internalid', null, 'anyof',
					itemCode);
			var itemCol = new Array();
			itemCol[0] = new nlobjSearchColumn('upccode');
			var itemResult = nlapiSearchRecord('item', null, itemfilter,
					itemCol);
			if (itemResult != null && itemResult != '') {
				var itemType = itemResult[0].getRecordType();

				upcCode = itemResult[0].getValue('upccode');

			}

			so.setLineItemValue('item', 'custcol_return_royalty_amount',
					lineItemIndex, ASA);
			so.setLineItemValue('item', 'custcolpurchaseorder_upc',
					lineItemIndex, upcCode);

			// so.commitLineItem('item');

		}
	}
	var so_id = nlapiSubmitRecord(so, true, true);
	
	nlapiLogExecution('DEBUG', 'Created sales order '+so_id);
	if (so_id != null && so_id != '') {
		soflag = 'yes';
	}
	return soflag;
}

function createEmailTemplate(soid) {
	// nlapiLogExecution('debug','create email template','soid = '+soid);
	// loading the salesorder for the items to include in the email
	var preOrderSORec = nlapiLoadRecord('salesorder', soid);
	var subtotal = preOrderSORec.getFieldValue('subtotal');
	var shippingCost = preOrderSORec.getFieldValue('altshippingcost');
	var taxTotal = preOrderSORec.getFieldValue('taxtotal');
	var total = preOrderSORec.getFieldValue('total');
	var memo = preOrderSORec.getFieldValue('memo');
	var date = preOrderSORec.getFieldValue('trandate');
	var shipAddress = preOrderSORec.getFieldValue('shipaddress');
	var customerid = preOrderSORec.getFieldValue('entity');

	var preOrderlineItemCount = preOrderSORec.getLineItemCount('item');

	// loading the customer to get the default shipping address
	var customerRec = nlapiLoadRecord('customer', customerid);
	var phone = customerRec.getFieldValue('phone');

	var address1 = '';
	var address2 = '';
	var country = '';
	var city = '';
	var state = '';
	var zip = '';
	var count = customerRec.getLineItemCount('addressbook');
	if (count > 0) {
		for ( var k = 1; k <= count; k++) {
			var defaultShipping = customerRec.getLineItemValue('addressbook',
					'defaultshipping', k);
			// nlapiLogExecution('debug','create email
			// template','defaultShipping = '+defaultShipping);
			if (defaultShipping == 'T') {
				address1 = nlapiGetLineItemValue('addressbook', 'addr1', k);
				address2 = nlapiGetLineItemValue('addressbook', 'addr2', k);
				country = nlapiGetLineItemValue('addressbook', 'country', k);
				city = nlapiGetLineItemValue('addressbook', 'city', k);
				state = nlapiGetLineItemValue('addressbook', 'state', k);
				zip = nlapiGetLineItemValue('addressbook', 'zip', k);

				break;
			}

		}
	}

	// var shipAddressSplit = shipAddress.split(' ');
	// var name = shipAddressSplit[0];

	// preparing the content for the template

	var emailContent = '';
	emailContent += '<title>Template</title>';
	emailContent += '<style>';
	emailContent += '.smalltext { font-size: 10pt; font-family: Arial, Sans-Serif }';
	emailContent += '.smalltextbold { font-size: 10pt; font-family: Arial, Sans-Serif; font-weight:bold }';
	emailContent += '.mediumtext { font-size: 12pt; font-family: Arial, Sans-Serif }';
	emailContent += '.mediumtextbold { font-size: 12pt; font-family: Arial, Sans-Serif; font-weight:bold }';
	emailContent += '.texttable  { font-size: 10pt;  border-style: solid; border-width: 1 1 1 1; border-color: Gray; vertical-align: top;font-size: 10pt; font-family: Arial, Sans-Serif; padding:7 7 7 7}';
	emailContent += '.texttablebold  { font-size: 10pt; font-weight: bold; border-style: solid; border-width: 1 1 1 1; border-color: Gray;font-size: 10pt; font-family: Arial, Sans-Serif; padding:7 7 7 7}';
	emailContent += '.texttablectr  { font-size: 10pt; text-align: center; border-style: solid; border-width:  1 1 1 1; border-color: Gray;font-size: 10pt; font-family: Arial, Sans-Serif; padding:7 7 7 7}';
	emailContent += '.texttablert  { font-size: 10pt; text-align: right; border-style: solid; border-width:  1 1 1 1; border-color: Gray; font-size: 10pt; font-family: Arial, Sans-Serif; padding:7 7 7 7}';
	emailContent += '.cartstrikeoutamount { text-decoration:line-through }';
	emailContent += '.listheadernosort {text-align:left; font-weight: bold; font-size:10pt; font-family:Arial, Sans-Serif; background-color: #dbe5f1; border-style: solid; border-width:1 1 1 1; border-color: Gray; padding:0 0 0 0;  border-spacing:0; }';
	emailContent += ' td {padding:0 0 0 0; border-spacing:0;}';
	emailContent += ' </style>';
	emailContent += '<center>';
	emailContent += '<table style="margin: 0 auto; border-collapse: collapse; font-size: 11px;  font-family:Arial, Helvetica, sans-serif;" border="0" cellpadding="0" cellspacing="0" width="700">';
	emailContent += '<tbody><tr>';
	emailContent += '<td colspan="9" bgcolor="#C32F3D" height="40" width="700">';
	emailContent += '<a href="http://beta-www.funimation.com"><img src="http://echo3.bluehornet.com/cimages/53d77f76a1705d515b47a4f90dad6d57/nws_logo.gif" alt="" height="40" width="188"></a></td>';
	emailContent += '</tr>';
	emailContent += '<tr>';
	emailContent += '<td colspan="9" style="background-color:#000000;">';
	emailContent += '<img src="http://echo3.bluehornet.com/cimages/53d77f76a1705d515b47a4f90dad6d57/nws_spacer.gif" alt="" height="10" width="700"></td>';
	emailContent += '</tr>';
	emailContent += '<tr>';
	emailContent += '<td style="background-color:#000000;" width="10">';
	emailContent += '<img src="http://echo3.bluehornet.com/cimages/53d77f76a1705d515b47a4f90dad6d57/nws_spacer.gif" alt="" height="30" width="10"></td>';
	emailContent += '<td style="background-color:#404445;" width="551">';
	emailContent += '<img src="http://echo3.bluehornet.com/cimages/53d77f76a1705d515b47a4f90dad6d57/nws_spacer.gif" alt="" height="30" width="551"></td>';
	emailContent += '<td style="background-color:#404445;" width="36"><a href="http://www.facebook.com/funimation"><img src="http://echo3.bluehornet.com/cimages/53d77f76a1705d515b47a4f90dad6d57/nws_facebook.gif" alt="" style="border: none;" height="30" width="36"></a></td>';
	emailContent += '<td style="background-color:#404445;" width="29"><a href="http://twitter.com/funimation"><img src="http://echo3.bluehornet.com/cimages/53d77f76a1705d515b47a4f90dad6d57/nws_twitter.gif" alt="" style="border: none;" height="30" width="29"></a></td>';
	emailContent += '<td style="background-color:#404445;" width="31"><a href="http://www.youtube.com/funimation"><img src="http://echo3.bluehornet.com/cimages/53d77f76a1705d515b47a4f90dad6d57/nws_youtube.gif" alt="" style="border: none;" height="30" width="31"></a></td>';
	emailContent += '<td style="background-color:#404445;" width="33">';
	emailContent += '<img src="http://echo3.bluehornet.com/cimages/53d77f76a1705d515b47a4f90dad6d57/nws_spacer.gif" alt="" height="30" width="33"></td>';
	emailContent += '<td style="background-color:#000000;" width="10">';
	emailContent += '<img src="http://echo3.bluehornet.com/cimages/53d77f76a1705d515b47a4f90dad6d57/nws_spacer.gif" alt="" height="30" width="10"></td>';
	emailContent += '</tr>';
	emailContent += '<tr>';
	emailContent += '<td style="background-color:#000000;">';
	emailContent += '<img src="http://echo3.bluehornet.com/cimages/53d77f76a1705d515b47a4f90dad6d57/nws_spacer.gif" alt="" height="30" width="10"></td>';
	emailContent += '<td colspan="5" style="background-color:#ffffff;">';
	emailContent += '<table style="margin: 0 auto; background-color:#ffffff; border-collapse: collapse; font-size: 14px;" border="0" cellpadding="0" cellspacing="0" width="700">';
	emailContent += '<tbody><tr>';
	emailContent += '<td width="10"><br></td>';
	emailContent += '<td colspan="7">';
	emailContent += '<br><span style="color: red;" class="smalltextbold">Congratulations! </span>';
	emailContent += '<span style="color: black;" class="smalltext">You purchased anime or anime related goods! The electronic order below is proof that your life has been forever changed!</span>';
	emailContent += '<br><br><span style="color: black;" class="smalltext">For any questions, concerns, or returns, please e-mail </span>';
	emailContent += '<span class="smalltext"><a href="mailto:funimationstore@funimation.com?Subject=FUNimation Shop Order" style="color:Red">funimationstore@funimation.com</a>.</span>';
	emailContent += '<br>';
	emailContent += '<br></td>';
	emailContent += '<td width="10"><br></td>';
	emailContent += '</tr>';
	emailContent += '<tr>';
	emailContent += '<td width="10"><br></td>';
	emailContent += ' <td style="border:none" class="smalltextbold" colspan="7">';
	emailContent += 'Order Number:&nbsp;<span class="smalltext">' + memo
			+ '<br>';
	emailContent += '<br>';
	emailContent += 'Your order was placed on <span class="aBn" data-term="goog_846811912" tabindex="0"><span class="aQJ">'
			+ date + '</span></span><br>';// <span class="aBn"
	// data-term="goog_846811912"
	// tabindex="0"><span
	// class="aQJ">9/25/2013</span></span>
	emailContent += '<br>';
	emailContent += ' </span></td>';
	emailContent += '<td width="10"><br></td></tr>';
	emailContent += '<tr><td width="10"><br></td>';
	emailContent += '<td style="border:none;padding:0 0 0 0;" colspan="7">';
	emailContent += '<table cellpadding="0" cellspacing="0" width="100%"><tbody><tr><td style="font-family:Arial,Sans-Serif; font-size:10px">';
	// Item list
	emailContent += '<table width="100%" cellspacing="0" cellpadding="0"><tbody><tr><td style="font-family:Arial,Sans-Serif;font-size:10px">Order Summary:';
	emailContent += '<br><br>';
	// constructin for each item in the preorder SO
	for ( var it = 1; it <= preOrderlineItemCount; it++) {
		var itemId = preOrderSORec.getLineItemValue('item', 'item', it);
		// get the storedisplayname from the item
		var storeDisplayName = '';
		var itemfilter = new Array();
		itemfilter[0] = new nlobjSearchFilter('internalid', null, 'anyof',
				itemId);
		var itemCol = new Array();
		itemCol[0] = new nlobjSearchColumn('storedisplayname');
		var itemResult = nlapiSearchRecord('item', null, itemfilter, itemCol);
		if (itemResult != null && itemResult != '') {
			var itemType = itemResult[0].getRecordType();

			storeDisplayName = itemResult[0].getValue('storedisplayname');

		}

		var quantity = preOrderSORec.getLineItemValue('item', 'quantity', it);
		var description = preOrderSORec.getLineItemValue('item', 'description',
				it);
		var rate = preOrderSORec.getLineItemValue('item', 'rate', it);
		var amount = preOrderSORec.getLineItemValue('item', 'amount', it);
		emailContent += '<table width="100%" border="0" cellspacing="0" cellpadding="0"><tbody><tr>';
		emailContent += '<td valign="top">';
		emailContent += '<table width="100%" border="0" cellspacing="0" cellpadding="0">';
		emailContent += '<tbody><tr>';
		emailContent += '<td width="20.18%" align="LEFT"><div>Item</div></td>';
		emailContent += '<td width="5.26%" align="LEFT"><div>Qty</div></td>';
		emailContent += '<td width="23.67%" align="LEFT"><div>Brief Description</div></td>';
		emailContent += '<td width="8.78%" align="RIGHT"><div>Rate</div></td>';
		emailContent += '<td width="8.78%" align="RIGHT"><div>Amount</div></td>';
		emailContent += '<td width="15.78%" align="RIGHT"><div>Options</div></td>';
		emailContent += '</tr>';
		emailContent += '<tr>';
		emailContent += '<td>' + storeDisplayName + '</td>';
		emailContent += '<td>' + quantity + '</td>';
		emailContent += '<td>' + description + '</td>';
		emailContent += '<td align="RIGHT">$' + rate + '</td>';
		emailContent += '<td align="RIGHT">$' + amount + '</td>';
		emailContent += '<td>&nbsp;</td>';
		emailContent += '</tr>';
		emailContent += '<tr>';
		emailContent += '<td colspan="4">Subtotal</td>';
		emailContent += '<td align="RIGHT">$' + subtotal + '</td>';
		emailContent += '<td>&nbsp;</td>';
		emailContent += '</tr>';
		emailContent += '<tr>';
		emailContent += '<td colspan="4">Shipping</td>';
		emailContent += '<td align="RIGHT">$' + shippingCost + '</td>';
		emailContent += '<td>&nbsp;</td>';
		emailContent += '</tr>';
		emailContent += '<tr>';
		emailContent += '<td colspan="4">Tax</td>';
		emailContent += '<td align="RIGHT">' + taxTotal + '</td>';
		emailContent += '<td>&nbsp;</td>';
		emailContent += '</tr>';
		emailContent += '<tr>';
		emailContent += '<td colspan="4"><b>Total</b></td>';
		emailContent += '<td align="RIGHT"><b>$' + total + '</b></td>';
		emailContent += '<td>&nbsp;</td>';
		emailContent += '</tr>';
		emailContent += '</tbody></table>';
		emailContent += '</td>';
		emailContent += '</tr></tbody></table>';
	}
	emailContent += '<br>';
	emailContent += '</td></tr></tbody></table>';
	// item list
	emailContent += '</td></tr></tbody></table>';
	emailContent += '</td>';
	emailContent += '<td width="10"><br></td></tr>';
	emailContent += '<tr><td width="10"><br></td><td style="border:none" colspan="7">';
	emailContent += '<br><span class="smalltextbold">Shipping Information:<br><br></span>';
	emailContent += '<span class="smalltext">';

	// emailContent +=
	// '<span>'+name+'<br>'+address1+'<br>'+address2+'<br>'+city+' '+state+'
	// '+zip+'<br>'+country+'<br>Phone: '+phone+'</span>';
	emailContent += '<span>' + shipAddress + '<br>Phone: ' + phone + '</span>';

	emailContent += '</span>';

	emailContent += '<span class="smalltext"><br><br>When your order ships, you\'ll receive an e-mail with tracking information.<br><br></span>';
	emailContent += '</td>';
	emailContent += '<td width="10"><br></td></tr>';
	emailContent += '<tr><td width="10"><br></td>';
	emailContent += '<td style="border:none" colspan="7">';
	emailContent += '<span class="mediumtextbold" style="color:#304570;">Thanks for your business!</span><br>';
	emailContent += '<span class="mediumtext">FUNimation.com</span><br><br>';
	emailContent += '<span class="smalltextbold">How did we do? Please take a few quick minutes and complete the following survey.&nbsp;</span>';
	emailContent += '<a href="https://www.surveymonkey.com/s/funshop"><span class="smalltext">https://www.surveymonkey.com/s/funshop</span></a><br><br>';
	emailContent += '<span class="smalltextbold" style="color: rgb(193, 47, 60);">Be sure to follow us on </span><a href="https://twitter.com/FUNimation">';
	emailContent += '<span class="smalltextbold" style="color: rgb(193, 47, 60);">Twitter</span></a>';
	emailContent += '<span class="smalltextbold" style="color: rgb(193, 47, 60);"> and </span><a href="https://www.facebook.com/FUNimation">';
	emailContent += '<span class="smalltextbold" style="color: rgb(193, 47, 60);">Facebook</span></a>';
	emailContent += '<br><br></td>';
	emailContent += '<td width="10"><br></td></tr>';
	emailContent += '</tbody></table>';
	emailContent += '</td>';
	emailContent += '<td style="background-color:#000000;">';
	emailContent += '<img src="http://echo3.bluehornet.com/cimages/53d77f76a1705d515b47a4f90dad6d57/nws_spacer.gif" alt="" height="30" width="10"></td>';
	emailContent += '</tr>';
	emailContent += '<tr>';
	emailContent += '<td colspan="7" style="background-color:#000000;">';
	emailContent += '<img src="http://echo3.bluehornet.com/cimages/53d77f76a1705d515b47a4f90dad6d57/nws_spacer.gif" alt="" height="10" width="600"></td>';
	emailContent += '</tr>';
	emailContent += '<tr>';
	emailContent += '<td colspan="7" style="padding:10px 10px;">';
	emailContent += '<span class="smalltext"><br>This e-mail was sent from a notification-only e-mail account. Please do not reply. <br>As a security precaution, please do not email us your credit card number.<br>If you have additional questions, please visit our&nbsp;</span>';
	emailContent += '<a href="http://beta-www.funimation.com/support"><span class="smalltext">Support</span></a>';
	emailContent += '<span class="smalltext">&nbsp;section.</span></td>';
	emailContent += '</tr>';
	emailContent += '</tbody></table>';
	emailContent += '</center>';

	// preparing the content for the template

	return emailContent;
}
