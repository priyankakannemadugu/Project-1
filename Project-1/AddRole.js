/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       22 Oct 2013    Priyanka       Add Roles to the users & more, for attached list AddRole.csv

1. Set role to Not a subscriber in netsuite
2. Call the updateRole API and set role = 2 in vBulletin
3. Call the getUser API and set the first name in netsuite as username from vbulletin

 *
 */
var MINIMUM_USAGE = 150;

function addRole(type) {
	
	var headers = {};
	headers['Accept'] = 'application/soap+xml,application/json, application/dime, multipart/related, text/*';
	headers['Content-Type'] = 'application/x-www-form-urlencoded';

	//Fetch unprocessed temp customers
	var tempSearch = nlapiLoadSearch('customrecord_temp_sync_vbulletin',
			'customsearch_temp_sync_vbulletin');

	var tempResults = tempSearch.runSearch();

	do {

		var results = [];

		var resultslice = tempResults.getResults(0, 1000);
		for ( var rs in resultslice) {
			results.push(resultslice[rs]);
		}

		for ( var i = 0; i < results.length; i++) {
			
			if (nlapiGetContext().getRemainingUsage() <= MINIMUM_USAGE) {
				nlapiLogExecution('AUDIT', 'Add Role Customer scheduled script',
						'Not enough usage left('
								+ nlapiGetContext().getRemainingUsage()
								+ ') . Exiting and rescheduling script.');
				setRecoveryPoint();
				checkGovernance();

			} else {
				
				var customerRoleUpdateId = '';
				var updateVbulletinBody = '';
				var updateVbulletinCode='';
				var customerUsernameUpdateId = '';
				var vBulletinRole;
				
				//Check if a customer with this email already exists.
				var tempEmail = results[i].getValue('custrecord_email_sync');
				
				var filters = new Array();
				filters[filters.length] = new nlobjSearchFilter(
						'email', null, 'is', tempEmail);
				filters[filters.length] = new nlobjSearchFilter(
						'isinactive', null, 'is', 'F');
				filters[filters.length] = new nlobjSearchFilter(
						'giveaccess', null, 'is', 'T');
				
				var columns = new Array();
				columns[columns.length] = new nlobjSearchColumn('email');
				
				columns[columns.length] = new nlobjSearchColumn('custentity_role');
				
				var customerResults = nlapiSearchRecord('customer', null,
						filters, columns);
				
				//If an active customer with this email exists, 
				if(customerResults != null && customerResults.length > 0) {
					
					/*var role  = customerResults[0].getValue('custentity_role');
					
					
					//set the role to "Not a Subscriber"-3 in netsuite
					try{
						if(role == 3) {
							vBulletinRole = 2;
						} else if(role == 2) {
							vBulletinRole = 12;
						} else if(role == 1) {
							vBulletinRole = 11;
						}
							//customerRoleUpdateId = nlapiSubmitField('customer', customerResults[0].getId(), 'custentity_role', '3');
					}
					catch(e) {
						if (e instanceof nlobjError) {
							nlapiLogExecution('ERROR',
									'Update Roles Scheduled script',
									'There was an unexpected netsuite error while updating customer(1)- '
											+ e.getCode() + '\n'
											+ e.getDetails());
							
							nlapiSubmitField('customrecord_temp_sync_vbulletin', results[i].getId(), 'custrecord_error_sync', e.getDetails());

						} else {
							nlapiLogExecution('ERROR',
									'Update Roles Scheduled script',
									'There was an unexpected error while updating customer(1)-'
											+ e.toString());
							
							nlapiSubmitField('customrecord_temp_sync_vbulletin', results[i].getId(), 'custrecord_error_sync', e.toString());

						}
						
						continue;
					}
				*/
					
					
					//update role in vbulletin as "Not a subscriber" - 2 
					
					var updateUserUrl = 'http://www.funimation.com/frontend_api/updateUserRole/email/'+(tempEmail.trim())+'/role_id/2';
					
					/*try{
						
						var apiResult = nlapiRequestURL(updateUserUrl, null,
								headers);
						
						updateVbulletinBody = apiResult.getBody();
						updateVbulletinCode = apiResult.getCode();
					} catch(e) {
						if (e instanceof nlobjError) {
							nlapiLogExecution('ERROR',
									'Update Roles Scheduled script',
									'There was an unexpected netsuite error while setting role in vbulletin- '
											+ e.getCode() + '\n'
											+ e.getDetails());
							
							nlapiSubmitField('customrecord_temp_sync_vbulletin', results[i].getId(), 'custrecord_error_sync', e.getDetails());

						} else {
							nlapiLogExecution('ERROR',
									'Update Roles Scheduled script',
									'There was an unexpected error setting role in vbulletin-'
											+ e.toString());
							
							nlapiSubmitField('customrecord_temp_sync_vbulletin', results[i].getId(), 'custrecord_error_sync', e.toString());

						}
						
						continue;
					}*/
				
						
					//Get user name from vBulletin
					var resultText = '';
					var getUserUrl = 'http://www.funimation.com/frontend_api/getUser/email/'+(tempEmail.trim());
					try{
						var apiResult = nlapiRequestURL(getUserUrl, null,
								headers);
						
					resultText = apiResult.getBody();
					} catch(e) {
						if (e instanceof nlobjError) {
							nlapiLogExecution('ERROR',
									'Update Roles Scheduled script',
									'There was an unexpected netsuite error while getting username from vbulletin- '
											+ e.getCode() + '\n'
											+ e.getDetails());
							
							nlapiSubmitField('customrecord_temp_sync_vbulletin', results[i].getId(), 'custrecord_error_sync', e.getDetails());

						} else {
							nlapiLogExecution('ERROR',
									'Update Roles Scheduled script',
									'There was an unexpected error while getting username from vbulletin-'
											+ e.toString());
							
							nlapiSubmitField('customrecord_temp_sync_vbulletin', results[i].getId(), 'custrecord_error_sync', e.toString());

						}
						
						continue;
					}
					if (resultText != null) {
						try{
						resultText = eval("(" + resultText + ')');
						var firstName = resultText.info.username;
					
						nlapiLogExecution('DEBUG','firstName= '+firstName);
						//set the firstname in netsuite as the username from vbulletin
						
						var customerRec = nlapiLoadRecord('customer',customerResults[0].getId());
						
						with(customerRec)
						{
							
							setFieldValue('firstname',firstName);//17 - FUN Online Customer Form 
														
						}
						customerUsernameUpdateId =  nlapiSubmitRecord(customerRec,true);
			            if(customerUsernameUpdateId != null && customerUsernameUpdateId != '')
			            {
			            	nlapiLogExecution('DEBUG','Customer is successfully updated with the firstname for customer with internal id - '+customerUsernameUpdateId);
			            	//nlapiSubmitField('customrecord_temp_sync_vbulletin', results[i].getId(), 'custrecord_processed_syncessed', 'T');
			            }
						}catch(e) {
							if (e instanceof nlobjError) {
								nlapiLogExecution('ERROR',
										'Update Roles Scheduled script',
										'There was an unexpected netsuite error while updating a customer(2)- '
												+ e.getCode() + '\n'
												+ e.getDetails());
								
								nlapiSubmitField('customrecord_temp_sync_vbulletin', results[i].getId(), 'custrecord_error_sync', e.getDetails());

							} else {
								nlapiLogExecution('ERROR',
										'Update Roles Scheduled script',
										'There was an unexpected error while updating a customer(2)-'
												+ e.toString());
								
								nlapiSubmitField('customrecord_temp_sync_vbulletin', results[i].getId(), 'custrecord_error_sync', e.toString());

							}
							
							continue;
						}
					}
					
					//if everything goes fine - able to update role in Netsuite and vBulletin, and update user name, then set the "Processed" checkbox to T 
				/*	if(customerRoleUpdateId != null && customerRoleUpdateId != '' && customerUsernameUpdateId != null && customerUsernameUpdateId != '' && updateVbulletinBody != null && updateVbulletinBody != '' && updateVbulletinCode == 200)
						{*/
						nlapiSubmitField('customrecord_temp_sync_vbulletin', results[i].getId(), 'custrecord_processed_sync', 'T');
						/*}
					else
						{ 
						//do not set the processed checkbox and set the error field
							if(customerRoleUpdateId == null || customerRoleUpdateId == '')
								{
								nlapiSubmitField('customrecord_temp_sync_vbulletin', results[i].getId(), 'custrecord_error_sync', 'There is a problem while updating the role in customer as not a subscriber.');
								}
							if(customerUsernameUpdateId == null || customerUsernameUpdateId == '')
								{
								nlapiSubmitField('customrecord_temp_sync_vbulletin', results[i].getId(), 'custrecord_error_sync', 'There is a problem while updating the firstname as the username from vbulletin.');
								}
							if(updateVbulletinBody == null || updateVbulletinBody == '' || updateVbulletinCode != 200)
								{
								nlapiSubmitField('customrecord_temp_sync_vbulletin', results[i].getId(), 'custrecord_error_sync', 'There is a problem while updating the role as not a subscriber in vbulletin.');
								}
						
						}*/

				}
			}
		}

	} while (tempResults != null);

}


function setRecoveryPoint() {
    var state = nlapiSetRecoveryPoint(); //100 point governance
    if (state.status == 'SUCCESS') return; //we successfully create a new recovery point
    if (state.status == 'RESUME') //a recovery point was previously set, we are resuming due to some unforeseen error
    {
        nlapiLogExecution("ERROR", "Resuming script because of " + state.reason + ".  Size = " + state.size);
        return;
    } else if (state.status == 'FAILURE') //we failed to create a new recovery point
    {
        nlapiLogExecution("ERROR", "Failed to create recovery point. Reason = " + state.reason + " / Size = " + state.size);
    }
}

function checkGovernance() {
    var context = nlapiGetContext();
    if (context.getRemainingUsage() < MINIMUM_USAGE) {
        var state = nlapiYieldScript();
        if (state.status == 'FAILURE') {
            nlapiLogExecution("ERROR", "Failed to yield script, exiting: Reason = " + state.reason + " / Size = " + state.size);
                       throw "Failed to yield script";
        }
    }
}