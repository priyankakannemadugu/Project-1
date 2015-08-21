/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       15 Nov 2013     athira
 *
 */

/**
 * @param {String}
 *            type Context Types: scheduled, ondemand, userinterface, aborted,
 *            skipped
 * @returns {Void}
 */

var MINIMUM_USAGE = 100;

function scheduled(type) {

	var updateApi = 'http://beta-www.funimation.com/frontend_api/updateUserRole';
	
	var headers = {};
	headers['Accept'] = 'application/soap+xml,application/json, application/dime, multipart/related, text/*';
	headers['Content-Type'] = 'application/x-www-form-urlencoded';

	var mSearch = nlapiLoadSearch('customrecord_membership',
			'customsearch_pp_imported_no_id');
	var searchResults = mSearch.runSearch();

	do {
	if (searchResults != null && searchResults != '') {

		try {

			
			// searchResults.forEachResult(updatePaypal);

			var results = [];
			var searchid = 0;
			var resultslice = '';

			resultslice = searchResults.getResults(searchid, searchid + 1000);
			for ( var rs in resultslice) {
				results.push(resultslice[rs]);
				searchid++;
			}
			nlapiLogExecution('ERROR', 'Update Temp Price Scheduled script',
					'There are ' + results.length + 'items.');

			if (results != null && results != '') {

				for ( var it = 0; it < results.length; it++) {

					if (nlapiGetContext().getRemainingUsage() <= MINIMUM_USAGE) {
						nlapiLogExecution(
								'AUDIT',
								'Update Temp Price Scheduled script',
								'Not enough usage left('
										+ nlapiGetContext().getRemainingUsage()
										+ ') . Exiting and rescheduling script at '
										+ results[it].getId());
						nlapiLogExecution(
								'AUDIT',
								'Category scheduled script',
								'Not enough usage left('
										+ nlapiGetContext().getRemainingUsage()
										+ ') . Exiting and rescheduling script.');
						setRecoveryPoint();
						checkGovernance();

					} else {

						var customerId = results[it]
								.getValue('custrecord_membership_customer');
						var membershipId = results[it].getId();

						// Cancel the membership in Netsuite.
						// custrecord_membership_status = 4

						nlapiLogExecution('DEBUG','Processing','customerId= '+customerId+' and membershipId= '+membershipId); 
						var subId = nlapiSubmitField(
								'customrecord_membership', membershipId,
								'custrecord_membership_status', '4');
						
						var today = new Date();
						/*var subId = nlapiSubmitField(
								'customrecord_membership', membershipId,
								'custrecord_membership_enddate', today);
								*/

						var customer = nlapiLoadRecord('customer',customerId);
						
						var email = results[it].getValue('email', 'CUSTRECORD_MEMBERSHIP_CUSTOMER');
						
						//Update role in vBulletin.
						var apiUrl = updateApi + '/email/' + email
								+ '/role_id/2';

						nlapiLogExecution('DEBUG', 'apiUrl', apiUrl);
						var apiResult = nlapiRequestURL(apiUrl, null, headers);

						var resultText = apiResult.getBody();
						nlapiLogExecution('DEBUG', 'Result from vBulletin',resultText);
						
						
						
						customer.setFieldValue('custentity_subscription_status', 2);
						customer.setFieldValue('custentity_role', 3);
						
						nlapiSubmitRecord(customer, false, true);

					}
				}
			}
		} catch (e) {
			if (e instanceof nlobjError) {
				nlapiLogExecution('ERROR',
						'Update Temp Price Scheduled script',
						'Error processing search result - ' + e.getCode()
								+ '\n' + e.getDetails());

			} else {
				nlapiLogExecution('ERROR',
						'Update Temp Price Scheduled script',
						'There was an unexpected error ' + e.toString());

			}

		}
	}
	}while (searchResults != null && searchResults != '');

}
