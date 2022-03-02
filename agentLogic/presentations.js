const { DateTime } = require('luxon')
const { v4: uuid } = require('uuid')
const axios = require('axios')

const ControllerError = require('../errors')

const AdminAPI = require('../adminAPI')
const Websockets = require('../websockets')
const Contacts = require('./contacts')
const Credentials = require('./credentials')
const Governance = require('./governance')
const Passports = require('./passports')
const Demographics = require('./demographics')

const Presentations = require('../orm/presentations')

const { getOrganization } = require('./settings')

const Util = require('../util')

// (eldersonar) Get Presentation Definition file
const getPresentationDefinition = async () => {
  try {
    const governance = await Governance.getGovernance()

    // Presentation definition file
    const pdfLink = governance.actions.find(
      (item) => item.name === 'issue_trusted_traveler',
    ).details.presentation_definition

    const response = await axios({
      method: 'GET',
      url: pdfLink,
    }).then((res) => {
      return res.data
    })

    return response
  } catch (error) {
    console.error('Presentation Definition File Request Error')
    // console.log(error.response.status)
    console.log(error)

    // (eldersonar) Do we handle specific codes or handle all errors as one?
    // if (error.response.status)
    return undefined

    // throw error
  }
}

// (eldersonar) Request identity proof
const requestIdentityPresentation = async (connectionID) => {
  console.log(`Requesting Presentation from Connection: ${connectionID}`)

  const result = AdminAPI.Presentations.requestProof(
    connectionID,
    // (eldersonar) Add remaining fields when the holder is fixed.
    [
      'email',
      'phone',
      'street_address',
      'city',
      'state_province_region',
      'postalcode',
      'country',
      'passport_number',
      'surname',
      'given_names',
      'sex',
      'date_of_birth',
      'place_of_birth',
      'nationality',
      'date_of_issue',
      'date_of_expiration',
      'type',
      'issuing_country',
      'authority'
    ],
  )
  return result
}

// (Eldersonar) This function takes an array of arrays and returns the cartesian product
// (Eldersonar) Spread (...args) if want to send multiple arrays instead of array of arrays
function cartesian(args) {
  let result = [],
    max = args.length - 1

  // Recursive helper function
  function helper(arr, i) {
    for (let j = 0, l = args[i].length; j < l; j++) {
      let a = arr.slice(0) // clone arr
      a.push(args[i][j])
      if (i == max) {
        result.push(a)
      } else helper(a, i + 1)
    }
  }
  helper([], 0)
  return result
}

// TODO: remove after development
let counter = 0

const createPresentationRequest = async (
  connectionID,
  predicates,
  attributes,
  name,
  comment,
) => {
  // counter++

  let list = { presentations: [] }

  // Get contact
  const contact = await Contacts.getContactByConnection(connectionID, [
    'Traveler',
  ])
  console.log(contact)

  // Create a proof element
  const listElement = {
    [name]: {
      result: null,
      presentation: {},
    },
  }

  // Rearrange data
  let presentationArray = []
  presentationArray.push(listElement)
  list.presentations = presentationArray

  let oldProofList = []

  // Check if proof result list is empty
  if (
    !contact.Traveler.dataValues.proof_result_list ||
    Object.keys(contact.Traveler.dataValues.proof_result_list.presentations)
      .length === 0
  ) {
    console.log('empty object')

    // Update traveler's proof result list
    await Travelers.updateProofResultList(contact.contact_id, list)

    list = []
    presentationArray = []
  } else {
    console.log('NOT empty object')
    // Add new proof result element to the old list
    oldProofList =
      contact.Traveler.dataValues.proof_result_list.presentations[0]
    list.presentations.push(oldProofList)

    // Update traveler's proof result list
    await Travelers.updateProofResultList(contact.contact_id, list)

    list = []
    presentationArray = []
  }

  // console.log("________________________________________________")
  // console.log("This is the counter")
  // console.log(counter)
  // console.log("")
  // console.log(name)
  // console.log(predicates)
  // console.log(attributes)
  // console.log("____________________________________")

  // (eldersonar) Send presentation request
  await AdminAPI.Presentations.requestPresentation(
    connectionID,
    predicates,
    attributes,
    name,
    comment,
    false,
  )
}

// (eldersonar) Complex input descriptors handler (one or multiple in-field conditions)
const handleCartesianProductSet = async (
  descriptor,
  cartesianSet,
  connectionID,
) => {
  try {
    const date = Math.floor(Date.now() / 1000)
    const schema_id = descriptor.schema[0].uri
    const name = descriptor.name
    const comment = `Requesting Presentation for ${descriptor.name}`

    // (eldersonar) For each cartesian product of sets
    for (let i = 0; i < cartesianSet.length; i++) {
      let attributes = {}
      let predicates = {}

      // Cartesian product descriptor handler loop
      for (let j = 0; j < cartesianSet[i].length; j++) {
        const dependentPath = cartesianSet[i][j].dependent_fields[0].path
          .join('')
          .split('$.')[1] // (eldersonar) will be not valid if have more than 1 path in the array

        // (eldersonar) Push descriptors into array from cartesion set (in-field dependent fields)
        if (cartesianSet[i][j].dependent_fields[0].filter.exclusiveMinimum) {
          if (
            cartesianSet[i][
              j
            ].dependent_fields[0].filter.exclusiveMinimum.includes('today:')
          ) {
            predicates[dependentPath] = {
              p_type: '>',
              p_value:
                date -
                cartesianSet[i][
                  j
                ].dependent_fields[0].filter.exclusiveMinimum.split(':')[2],
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[dependentPath] = {
              p_type: '>',
              p_value: date,
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (cartesianSet[i][j].dependent_fields[0].filter.minimum) {
          if (
            cartesianSet[i][j].dependent_fields[0].filter.minimum.includes(
              'today:',
            )
          ) {
            predicates[dependentPath] = {
              p_type: '>=',
              p_value:
                date -
                cartesianSet[i][j].dependent_fields[0].filter.minimum.split(
                  ':',
                )[2],
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[dependentPath] = {
              p_type: '>=',
              p_value: date,
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (
          cartesianSet[i][j].dependent_fields[0].filter.exclusiveMaximum
        ) {
          if (
            cartesianSet[i][
              j
            ].dependent_fields[0].filter.exclusiveMaximum.includes('today:')
          ) {
            predicates[dependentPath] = {
              p_type: '<',
              p_value:
                date -
                cartesianSet[i][
                  j
                ].dependent_fields[0].filter.exclusiveMaximum.split(':')[2],
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[dependentPath] = {
              p_type: '<',
              p_value: date,
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (cartesianSet[i][j].dependent_fields[0].filter.maximum) {
          if (
            cartesianSet[i][j].dependent_fields[0].filter.maximum.includes(
              'today:',
            )
          ) {
            predicates[dependentPath] = {
              p_type: '<=',
              p_value:
                date -
                cartesianSet[i][j].dependent_fields[0].filter.maximum.split(
                  ':',
                )[2],
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[dependentPath] = {
              p_type: '<=',
              p_value: date,
              name: dependentPath,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        }
      }

      // (eldersonar) Regular descriptors handler loop
      for (let k = 0; k < descriptor.constraints.fields.length; k++) {
        const path = descriptor.constraints.fields[k].path
          .join('')
          .split('$.')[1] // (eldersonar) will be not valid if have more than 1 path in the array

        // (eldersonar) Push regular descriptors into array
        if (descriptor.constraints.fields[k].filter.exclusiveMinimum) {
          if (
            descriptor.constraints.fields[k].filter.exclusiveMinimum.includes(
              'today:',
            )
          ) {
            predicates[path] = {
              p_type: '>',
              p_value:
                date -
                descriptor.constraints.fields[k].filter.exclusiveMinimum.split(
                  ':',
                )[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '>',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (descriptor.constraints.fields[k].filter.minimum) {
          if (
            descriptor.constraints.fields[k].filter.minimum.includes('today:')
          ) {
            predicates[path] = {
              p_type: '>=',
              p_value:
                date -
                descriptor.constraints.fields[k].filter.minimum.split(':')[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '>=',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (descriptor.constraints.fields[k].filter.exclusiveMaximum) {
          if (
            descriptor.constraints.fields[k].filter.exclusiveMaximum.includes(
              'today:',
            )
          ) {
            predicates[path] = {
              p_type: '<',
              p_value:
                date -
                descriptor.constraints.fields[k].filter.exclusiveMaximum.split(
                  ':',
                )[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '<',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (descriptor.constraints.fields[k].filter.maximum) {
          if (
            descriptor.constraints.fields[k].filter.maximum.includes('today:')
          ) {
            predicates[path] = {
              p_type: '<=',
              p_value:
                date -
                descriptor.constraints.fields[k].filter.maximum.split(':')[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '<=',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
          // (eldersonar) Assemble the list of attributes
        } else {
          // attributes.push(path)

          attributes[path] = {
            name: path,
            restrictions: [{ schema_id }],
          }
        }
      }

      // (eldersonar) Assemble presentation request
      await createPresentationRequest(
        connectionID,
        predicates,
        attributes,
        name,
        comment,
      )
    }
  } catch (error) {
    console.log(error)
  }
}

// (eldersonar) Simple input descriptors handler (no in-field conditions)
const handleSimpleDescriptors = async (descriptors, connectionID) => {
  try {
    for (let i = 0; i < descriptors.length; i++) {
      let attributes = {}
      let predicates = {}

      const schema_id = descriptors[i].schema[0].uri
      const name = descriptors[i].name
      const comment = `Requesting Presentation for ${descriptors[i].name}`
      const date = Math.floor(Date.now() / 1000)

      for (let j = 0; j < descriptors[i].constraints.fields.length; j++) {
        const path = descriptors[i].constraints.fields[j].path
          .join('')
          .split('$.')[1] // (eldersonar) TODO: turn into a loop. This ill be not valid if have more than 1 path in the array

        // Push descriptors into array
        if (descriptors[i].constraints.fields[j].filter.exclusiveMinimum) {
          if (
            descriptors[i].constraints.fields[
              j
            ].filter.exclusiveMinimum.includes('today:')
          ) {
            predicates[path] = {
              p_type: '>',
              p_value:
                date -
                descriptors[i].constraints.fields[
                  j
                ].filter.exclusiveMinimum.split(':')[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '>',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (descriptors[i].constraints.fields[j].filter.minimum) {
          if (
            descriptors[i].constraints.fields[j].filter.minimum.includes(
              'today:',
            )
          ) {
            predicates[path] = {
              p_type: '>=',
              p_value:
                date -
                descriptors[i].constraints.fields[j].filter.minimum.split(
                  ':',
                )[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '>=',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (
          descriptors[i].constraints.fields[j].filter.exclusiveMaximum
        ) {
          if (
            descriptors[i].constraints.fields[
              j
            ].filter.exclusiveMaximum.includes('today:')
          ) {
            predicates[path] = {
              p_type: '<',
              p_value:
                date -
                descriptors[i].constraints.fields[
                  j
                ].filter.exclusiveMaximum.split(':')[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '<',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else if (descriptors[i].constraints.fields[j].filter.maximum) {
          if (
            descriptors[i].constraints.fields[j].filter.maximum.includes(
              'today:',
            )
          ) {
            predicates[path] = {
              p_type: '<=',
              p_value:
                date -
                descriptors[i].constraints.fields[j].filter.maximum.split(
                  ':',
                )[2],
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          } else {
            predicates[path] = {
              p_type: '<=',
              p_value: date,
              name: path,
              restrictions: [
                {
                  schema_id,
                },
              ],
            }
          }
        } else {
          attributes[path] = {
            name: path,
            restrictions: [{ schema_id }],
          }
        }
      }

      // (eldersonar) TODO: Comment in to create presentation requests from "regular" input descriptors

      // (eldersonar) Assemble presentation request
      await createPresentationRequest(
        connectionID,
        predicates,
        attributes,
        name,
        comment,
      )

      // (eldersonar) Clear variables at the end of each iteration
      attributes = {}
      predicates = {}
    }
  } catch (error) {
    console.log(error)
  }
}

// Governance presentation request
const requestPresentation = async (connectionID, type) => {
  console.log(`Requesting Presentation from Connection: ${connectionID}`)

  // (eldersonar) Get governance file and presentation exchange file
  const pdf = await Governance.getPresentationDefinition()

  //------------ (eldersonar) TODO: remove after trial-------------

  const contact = await Contacts.getContactByConnection(connectionID, [])

  // Update traveler's answer to the question
  // await Travelers.updateProofType(contact.contact_id, type)

  // let pdf = {}
  // if (type === 'Lab+Vaccine') {
  //   pdf = await Governance.getLabVaccinePresentationDefinition()
  // } else if (type === 'Lab') {
  //   pdf = await Governance.getLabPresentationDefinition()
  // }
  // //------------ (eldersonar) TODO: remove after trial-------------

  const inputDescriptors = pdf.presentation_definition.input_descriptors

  try {
    // let result = null
    // let proofCheckResult = []

    const date = Math.floor(Date.now() / 1000)

    // (eldersonar) Check if we have submission requirments
    if (pdf.presentation_definition.submission_requirements) {
      if (
        !pdf.presentation_definition.submission_requirements[0].hasOwnProperty(
          'from_nested',
        )
      ) {
        // Loop through the input descriptors
        let i = inputDescriptors.length

        // (Eldersonar) Loop through all input descriptors
        while (i--) {
          // (eldersonar) Execute if there are any of input descriptors match the submission requirements group value
          if (
            inputDescriptors[i].group.includes(
              pdf.presentation_definition.submission_requirements[0].from,
            )
          ) {
            let predicateArray = []
            let descriptor = {}

            descriptor = inputDescriptors[i]

            console.log('')
            console.log('array of inputDescriptors')
            console.log(inputDescriptors)

            // (Eldersonar) This flag allows to track which input descriptors needs to be removed from the list
            let remove = false

            // Loop through all descriptor fields
            for (
              let j = 0;
              j < inputDescriptors[i].constraints.fields.length;
              j++
            ) {
              // (Eldersonar) If an input descriptor has some in-field conditional logic
              if (inputDescriptors[i].constraints.fields[j].filter.oneOf) {
                // (Eldersonar) Get fields with in-field conditional logic
                predicateArray.push(
                  inputDescriptors[i].constraints.fields[j].filter.oneOf,
                )

                // (Eldersonar) Mark this input descriptor for deletion
                remove = true
              }
            }

            // (Eldersonar) Get cartesian sets here
            if (predicateArray.length) {
              console.log('')
              console.log('this is ready to become cartesian set: ')
              console.log(predicateArray)

              // (Eldersonar) Assign the result of cartesian product of sets to a variable
              let cartesianProduct = cartesian(predicateArray, descriptor)

              await handleCartesianProductSet(
                descriptor,
                cartesianProduct,
                connectionID,
              )
              // (Eldersonar) Clear the predicate array before new iteration
              predicateArray = []
              descriptor = {}

              console.log('')
              console.log('cartesian product of an array set')
              console.log(cartesianProduct)
            }

            cartesianProduct = []

            if (i > -1 && remove) {
              inputDescriptors.splice(i, 1)
            }
          } else {
            console.log(
              'There are no credentials of group ' +
              pdf.presentation_definition.submission_requirements[0].from,
            )
          }
        }

        // (eldersonar) TODO: Wrap into an if statement to check if the the rest of the input descriptors are part of the submission requirment group.
        await handleSimpleDescriptors(inputDescriptors, connectionID)

        // (eldersonar) Handle nested submission requirments
      } else {
        console.log(
          '...........Handling creating proof requests from the nested submission requirements...........',
        )

        for (
          let g = 0;
          g <
          pdf.presentation_definition.submission_requirements[0].from_nested
            .length;
          g++
        ) {
          let chosenDescriptors = []

          for (let f = 0; f < inputDescriptors.length; f++) {
            if (
              inputDescriptors[f].group.includes(
                pdf.presentation_definition.submission_requirements[0]
                  .from_nested[g].from,
              )
            ) {
              chosenDescriptors.push(inputDescriptors[f])
            }
          }

          // Loop through the input descriptors
          let i = chosenDescriptors.length

          // (Eldersonar) Loop through all input descriptors
          while (i--) {
            // (eldersonar) Execute if there are any of input descriptors match the submission requirements group value
            if (
              chosenDescriptors[i].group.includes(
                pdf.presentation_definition.submission_requirements[0]
                  .from_nested[g].from,
              )
            ) {
              let predicateArray = []
              let descriptor = {}

              descriptor = chosenDescriptors[i]

              // (Eldersonar) This flag allows to track which input descriptors needs to be removed from the list
              let remove = false

              // Loop through all descriptor fields
              for (
                let j = 0;
                j < chosenDescriptors[i].constraints.fields.length;
                j++
              ) {
                // (Eldersonar) If an input descriptor has some in-field conditional logic
                if (chosenDescriptors[i].constraints.fields[j].filter.oneOf) {
                  // (Eldersonar) Get fields with in-field conditional logic
                  predicateArray.push(
                    chosenDescriptors[i].constraints.fields[j].filter.oneOf,
                  )

                  // (Eldersonar) Mark this input descriptor for deletion
                  remove = true
                }
              }

              // (Eldersonar) Get cartesian sets here
              if (predicateArray.length) {
                console.log('')
                console.log('this is ready to become cartesian set: ')
                console.log(predicateArray)

                // (Eldersonar) Assign the result of cartesian product of sets to a variable
                let cartesianProduct = cartesian(predicateArray, descriptor)

                handleCartesianProductSet(
                  descriptor,
                  cartesianProduct,
                  connectionID,
                )
                // (Eldersonar) Clear the predicate array before new iteration
                predicateArray = []
                descriptor = {}

                console.log('')
                console.log('cartesian product of an array set')
                console.log(cartesianProduct)
              }

              cartesianProduct = []

              if (i > -1 && remove) {
                chosenDescriptors.splice(i, 1)
              }
            } else {
              console.log(
                'There are no credentials of group ' +
                pdf.presentation_definition.submission_requirements[0].from,
              )
            }
          }

          // (eldersonar) TODO: Wrap into an if statement to check if the the rest of the input descriptors are part of the submission requirment group.
          handleSimpleDescriptors(chosenDescriptors, connectionID)
        }
      }
    }
  } catch (error) {
    console.error('Error getting proof options')
    throw error
  }
}

const validateFieldByField = (attributes, inputDescriptor) => {
  // (eldersonar) Value validation happens here

  let result = null
  let typePass = false
  let formatPass = false
  let valuePass = false
  let patternPass = false

  for (let key in attributes) {
    if (attributes.hasOwnProperty(key)) {
      console.log('')
      console.log(key + ' -> ' + attributes[key].raw)

      // Create prefixed attribute key
      const prefix = '$.'
      let prefixedKey = ''
      prefixedKey += prefix
      prefixedKey += key

      for (let p = 0; p < inputDescriptor.constraints.fields.length; p++) {
        // (eldersonar) Validate if field can be found
        if (inputDescriptor.constraints.fields[p].path.includes(prefixedKey)) {
          // (eldersonar) Type validation
          if (inputDescriptor.constraints.fields[p].filter.type) {
            switch (inputDescriptor.constraints.fields[p].filter.type) {
              case 'string':
                // Support empty string && attributes[key].raw !== ""
                if (typeof attributes[key].raw === 'string') {
                  console.log('the type check (STRING) have passed')
                  typePass = true
                } else {
                  console.log('this is NOT A STRING or STRING IS EMPTY')
                  typePass = false
                  break
                }
                break

              case 'number':
                if (!isNaN(attributes[key].raw)) {
                  console.log('the type check (NUMBER) have passed')
                  typePass = true
                } else {
                  console.log('this is NOT A NUMBER')
                  typePass = false
                  break
                }
                break

              case 'boolean':
                if (
                  attributes[key].raw === 'true' ||
                  attributes[key].raw === 'false'
                ) {
                  console.log('the type check (BOOLEAN) have passed')
                  typePass = true
                } else {
                  console.log('this is NOT A BOOLEAN')
                  typePass = false
                  break
                }
                break

              default:
                console.log('Error: The type check failed')
                typePass = false
                break
            }
          } else {
            console.log('no type was found for this attribute')
            typePass = true
          }

          // (eldersonar) Format validation
          if (inputDescriptor.constraints.fields[p].filter.format) {
            let dateNumber = parseInt(attributes[key].raw, 10)

            // (eldersonar) Check if the value can be transformed to a valid number
            if (attributes[key].raw === '') {
              console.log('format passed')
              typePass = true
            } else if (!isNaN(dateNumber)) {
              console.log('the date check (NUMBER) have passed')
              let luxonDate = DateTime.fromMillis(dateNumber).toISO()
              let date = new DateTime(luxonDate).isValid

              // (eldersonar) Check if the valid Luxon datetime format
              if (date) {
                console.log('format passed')
                typePass = true
              } else {
                console.log('this is NOT A DATE')
                console.log('format failed')
                typePass = false
                break
              }
            } else {
              console.log('this is NOT A DATE')
              console.log('format failed')
              typePass = false
              break
            }
          } else {
            console.log('no format was found for this attribute')
            formatPass = true
          }

          // (eldersonar) Value validation
          if (inputDescriptor.constraints.fields[p].filter.const) {
            // (eldersonar) Check if the value is a number datatype
            if (!isNaN(inputDescriptor.constraints.fields[p].filter.const)) {
              const stringNumber =
                '' + inputDescriptor.constraints.fields[p].filter.const

              if (attributes[key].raw === stringNumber) {
                console.log('value passed')
                valuePass = true
              } else {
                console.log('value failed')
                valuePass = false
                break
              }
            } else {
              if (
                attributes[key].raw ===
                inputDescriptor.constraints.fields[p].filter.const
              ) {
                console.log('value passed')
                valuePass = true
              } else {
                console.log('value failed')
                valuePass = false
                break
              }
            }
          } else {
            console.log('no value was found for this attribute')
            valuePass = true
          }

          // (eldersonar) Pattern validation
          if (inputDescriptor.constraints.fields[p].filter.pattern) {
            // Check if it's base64 encoded
            if (attributes[key].raw === '') {
              console.log('pattern passed')
              patternPass = true
            } else if (
              Buffer.from(
                inputDescriptor.constraints.fields[p].filter.pattern,
                'base64',
              ).toString('base64') ===
              inputDescriptor.constraints.fields[p].filter.pattern
            ) {
              console.log('decoding....')

              const decodedPattern = Util.decodeBase64(
                inputDescriptor.constraints.fields[p].filter.pattern,
              )

              const re = new RegExp(decodedPattern)

              // (eldersonar) Test pattern
              if (re.test(attributes[key].raw)) {
                console.log('pattern passed')
                patternPass = true
              } else {
                console.log('pattern failed')
                patternPass = false
                break
              }
              // If not base64 encoded
            } else {
              const re = new RegExp(
                inputDescriptor.constraints.fields[p].filter.pattern,
              )

              // (eldersonar) Test pattern
              if (re.test(attributes[key].raw)) {
                console.log('pattern passed')
                patternPass = true
              } else {
                console.log('pattern failed')
                patternPass = false
                break
              }
            }
          } else {
            console.log('no pattern was found for this attribute')
            patternPass = true
          }
        }
      }
    }
    // Break out of outer loop if validation failed
    if (!typePass || !valuePass || !patternPass || !formatPass) {
      result = false
      break
    } else {
      result = true
    }
  }
  return result
}

// Governance message handler
const adminMessage = async (message) => {
  console.log('Received Presentations Message', message)

  const governance = await Governance.getGovernance()
  const privileges = await Governance.getPrivilegesByRoles()

  let endorserDID = null
  let schemaID = null
  const protocol = 'https://didcomm.org/issue-credential/1.0/'

  // Get cred def id and schema id
  if (message.presentation && message.presentation.identifiers.length) {
    endorserDID = message.presentation.identifiers[0].cred_def_id
      .split(':', 1)
      .toString()
    schemaID = message.presentation.identifiers[0].schema_id
  }

  // TODO: Check governance and don't send schema id
  const participantValidated = await Governance.validateParticipant(
    schemaID,
    protocol,
    endorserDID,
  )

  // Update traveler's proof status
  const contact = await Contacts.getContactByConnection(message.connection_id, [
    'Traveler',
  ])

  const pdf = await Governance.getPresentationDefinition()

  //------------ (eldersonar) TODO: remove after trial-------------
  // let pdf = {}
  // if (contact.Traveler.dataValues.proof_type === 'Lab+Vaccine') {
  //   pdf = await Governance.getLabVaccinePresentationDefinition()
  // } else if (contact.Traveler.dataValues.proof_type === 'Lab') {
  //   pdf = await Governance.getLabPresentationDefinition()
  // }
  //------------ (eldersonar) TODO: remove after trial-------------

  const inputDescriptors = pdf.presentation_definition.input_descriptors

  // await Travelers.updateProofStatus(contact.contact_id, message.state)

  if (message.state === 'verified') {
    if (message.verified === 'true' && participantValidated && (
      (message.presentation.requested_proof.revealed_attrs &&
        Object.keys(message.presentation.requested_proof.revealed_attrs)
          .length > 0) ||
      (message.presentation.requested_proof.revealed_attr_groups &&
        Object.keys(message.presentation.requested_proof.revealed_attr_groups)
          .length > 0))
    ) {
      let attributes = ''
      let predicates = message.presentation.requested_proof.predicates

      // (mikekebert) Check the data format to see if the presentation requires the referrant pattern
      if (message.presentation.requested_proof.revealed_attr_groups) {
        attributes =
          message.presentation.requested_proof.revealed_attr_groups[
            Object.keys(
              message.presentation.requested_proof.revealed_attr_groups,
            )[0] // Get first group available
          ].values // TODO: this needs to be a for-in loop or similar later
      } else {
        attributes = message.presentation.requested_proof.revealed_attrs
      }

      const issuerName = await getOrganization()

      let credentialVerifiedAttributes = null

      if (attributes) {
        let credentialAttributes = [
          {
            name: 'traveler_surnames',
            value: attributes.patient_surnames.raw || '',
          },
          {
            name: 'traveler_given_names',
            value: attributes.patient_given_names.raw || '',
          },
          {
            name: 'traveler_date_of_birth',
            value: attributes.patient_date_of_birth.raw || '',
          },
          {
            name: 'traveler_gender_legal',
            value: attributes.patient_gender_legal.raw || '',
          },
          {
            name: 'traveler_country',
            value: attributes.patient_country.raw || '',
          },
          {
            name: 'traveler_origin_country',
            value: '',
          },
          {
            name: 'traveler_email',
            value: attributes.patient_email.raw || '',
          },
          {
            name: 'trusted_traveler_id',
            value: uuid(),
          },
          {
            name: 'trusted_traveler_issue_date_time',
            value: Math.round(
              DateTime.fromISO(new Date()).ts / 1000,
            ).toString(),
          },
          {
            name: 'trusted_traveler_expiration_date_time',
            value: Math.round(
              DateTime.local().plus({ days: 30 }).ts / 1000,
            ).toString(),
          },
          {
            name: 'governance_applied',
            value: governance.name + ' v' + governance.version,
          },
          {
            name: 'credential_issuer_name',
            value: issuerName.dataValues.value.organizationName || '',
          },
          {
            name: 'credential_issue_date',
            value: Math.round(
              DateTime.fromISO(new Date()).ts / 1000,
            ).toString(),
          },
        ]

        // Validation happens here
        // (eldersonar) Check if we have submission requirments
        if (pdf.presentation_definition.submission_requirements) {
          // (eldersonar) Execute if there are any of input descriptors match the submission requirements group value
          if (
            !pdf.presentation_definition.submission_requirements[0].hasOwnProperty(
              'from_nested',
            )
          ) {
            for (let i = 0; i < inputDescriptors.length; i++) {
              console.log('')
              console.log(
                `Comparing proof with ${inputDescriptors[i].name} input descriptor`,
              )
              console.log('')

              let fields = []
              let proofResult = false

              let fieldsValidationResult = false

              // (eldersonar) Execute if there are any of input descriptors match the submission requirements group value
              if (
                inputDescriptors[i].group.includes(
                  pdf.presentation_definition.submission_requirements[0].from,
                )
              ) {
                // Get an array of attributes
                for (
                  let j = 0;
                  j < inputDescriptors[i].constraints.fields.length;
                  j++
                ) {
                  const fieldPath = inputDescriptors[i].constraints.fields[
                    j
                  ].path
                    .join('')
                    .split('$.')[1] // (eldersonar) TODO: turn into a loop. This will be not valid if have more than 1 path in the array

                  fields.push(fieldPath)
                }
              }

              // (eldersonar) Get and sort the list of proof attributes and descriptor fields
              const proofAttributeKeys = Object.keys(attributes)
              const proofPredicateKeys = Object.keys(predicates)
              const predicatesAndArrays = proofAttributeKeys.concat(
                proofPredicateKeys,
              )
              const sortedProofFields = predicatesAndArrays.sort(function (
                a,
                b,
              ) {
                return a.localeCompare(b)
              })
              const sortedDescriptorFields = fields.sort(function (a, b) {
                return a.localeCompare(b)
              })

              // (eldersonar) Start validation
              if (sortedProofFields.length && sortedDescriptorFields.length) {
                // (eldersonar) Check if there is no array match (no credential match or no predicate match)
                if (
                  JSON.stringify(sortedProofFields) !=
                  JSON.stringify(sortedDescriptorFields)
                ) {
                  // (eldersonar) Get leftover fields with the filter
                  let nonDuplicateFields = sortedProofFields.filter(
                    (val) => !sortedDescriptorFields.includes(val),
                  )

                  for (
                    let k = 0;
                    k < inputDescriptors[i].constraints.fields.length;
                    k++
                  ) {
                    // (eldersonar) Check if input descriptor has in-field conditional logic
                    if (
                      inputDescriptors[i].constraints.fields[k].filter.oneOf
                    ) {
                      for (
                        let l = 0;
                        l <
                        inputDescriptors[i].constraints.fields[k].filter.oneOf
                          .length;
                        l++
                      ) {
                        for (let m = 0; m < nonDuplicateFields.length; m++) {
                          const prefix = '$.'
                          let lookupField = ''
                          lookupField += prefix
                          lookupField += nonDuplicateFields[m]

                          // (eldersonar) If we can find the field name in the list of in-field predicates
                          if (
                            inputDescriptors[i].constraints.fields[
                              k
                            ].filter.oneOf[l].dependent_fields[0].path.includes(
                              lookupField,
                            )
                          ) {
                            // (eldersonar) Removing predicate from the list of sorted fields
                            const index = sortedProofFields.indexOf(
                              nonDuplicateFields[m],
                            )
                            if (index > -1) {
                              sortedProofFields.splice(index, 1)
                            }

                            console.log(sortedProofFields)
                            console.log(sortedDescriptorFields)
                            console.log(
                              JSON.stringify(sortedProofFields) ===
                              JSON.stringify(sortedDescriptorFields),
                            )

                            // (eldersonar) Check if arrays match after the predicates were removed
                            if (
                              JSON.stringify(sortedProofFields) ===
                              JSON.stringify(sortedDescriptorFields)
                            ) {
                              console.log('')
                              console.log(
                                '_____________________________________________',
                              )
                              console.log('Validation of proof was successful.')

                              fieldsValidationResult = validateFieldByField(
                                attributes,
                                inputDescriptors[i],
                              )

                              proofResult = true
                            } else {
                              // console.log("Validation failed.")
                              proofResult = false
                            }
                          } else {
                            // console.log("Validation failed. No match was found.")
                            proofResult = false
                          }
                        }
                      }
                    }
                  }
                }
                // (eldersonar) Perfect match, proof fields are validated!
                else {
                  console.log('')
                  console.log('_____________________________________________')
                  console.log('Validation of proof was successful.')

                  fieldsValidationResult = validateFieldByField(
                    attributes,
                    inputDescriptors[i],
                  )

                  proofResult = true
                }
              } else {
                console.log('Error: lacking data for validation')
              }

              console.log(proofResult)
              console.log(fieldsValidationResult)

              // console.log("Original presentations array")
              // console.log("")
              // console.log(contact.Traveler.dataValues.proof_result_list.presentations)
              // console.log("")

              // let successFlag = null

              // for (let x = 0; x < contact.Traveler.dataValues.proof_result_list.presentations.length; x++) {
              //   console.log(contact.Traveler.dataValues.proof_result_list.presentations[x])

              //   console.log("this is an index count ---------------- ", x)

              //   // Get all the object keys
              //   let keys = Object.keys(contact.Traveler.dataValues.proof_result_list.presentations[x])

              //   let listElement = {
              //     [inputDescriptors[i].name]: {
              //       "result": true,
              //       presentation: {}
              //     }
              //   }

              //   console.log("keys")
              //   console.log(keys)
              //   console.log("keys")

              //   let proofList = contact.Traveler.dataValues.proof_result_list.presentations[x]

              //   let key = keys.join()

              //   console.log("checkkkkkkkkkkkkkkkkkkkkkk")
              //   console.log(inputDescriptors[i].name === key)
              //   console.log(inputDescriptors[i].name)
              //   console.log(key)

              //   if (inputDescriptors[i].name === key) {
              //     successFlag = true
              //     // keys.map(y => {
              //     //   proofList[y] = listElement[y]
              //     //   console.log("map magic")
              //     //   console.log(proofList[y])
              //     // })

              //     proofList[keys[0]] = listElement[keys[0]]
              //   }

              //   console.log("this is an updated list")
              //   console.log(proofList)

              //   let presentations = {}
              //   presentations.presentations = proofList

              //   // Update traveler's proof result list
              //   await Travelers.updateProofResultList(contact.contact_id, presentations)

              //   // Break out of outer loop if validation failed
              //   if (successFlag) {
              //     console.log("breakkkkkkkkkkkkkkkkkkkkkkk")
              //     break
              //   } else {
              //     console.log("continnueeeeeeeeeeeeeeeeeeee")
              //   }

              // }

              // (eldersonar) Hanlding additional manual validation for non-nested submission requirements
              // Check if all level validation passed
              if (proofResult && fieldsValidationResult) {
                console.log(
                  'Hanlding additional manual validation for non-nested submission requirements ',
                )
                // --------------------------- Handling and storing success -------------------------
                console.log('Original presentations array')
                console.log('')
                console.log(
                  contact.Traveler.dataValues.proof_result_list.presentations,
                )
                console.log('')

                let successFlag = null

                for (
                  let x = 0;
                  x <
                  contact.Traveler.dataValues.proof_result_list.presentations
                    .length;
                  x++
                ) {
                  console.log(
                    contact.Traveler.dataValues.proof_result_list.presentations[
                    x
                    ],
                  )

                  // Get all the object keys
                  let keys = Object.keys(
                    contact.Traveler.dataValues.proof_result_list.presentations[
                    x
                    ],
                  )

                  // Key to string
                  let key = keys.join()
                  let passedBusinessLogic = true

                  //const supportedVaccineCodes = ['JSN', 'MOD', 'PFR', 'ASZ']

                  // Check if the vaccine is approved by Aruba
                  //if (
                  //  contact.Traveler.dataValues.proof_result_list.presentations[
                  //    x
                  //  ].Vaccination
                  //) {
                  //  if (attributes.vaccine_manufacturer_code) {
                  //    // Check vaccine manufacturer
                  //    if (
                  //      supportedVaccineCodes.includes(
                  //        attributes.vaccine_manufacturer_code.raw,
                  //     )
                  //    ) {
                  //      console.log('Your vaccine is accepted by Aruba!')
                  //    } else {
                  //      console.log('Your vaccine is not accepted by Aruba!')

                  //      passedBusinessLogic = false
                  //    }
                  //  }
                  //}
                  // Check if the lab test is negative
                  if (
                    contact.Traveler.dataValues.proof_result_list.presentations[
                      x
                    ].Lab_Result
                  ) {
                    if (attributes.lab_result) {
                      // Check vaccine manufacturer
                      if (attributes.lab_result.raw === 'Negative') {
                        console.log('You were not tested COVID positive!')
                      } else {
                        console.log('You were tested COVID positive!')

                        passedBusinessLogic = false
                      }
                    }
                  }

                  console.log(passedBusinessLogic)

                  if (passedBusinessLogic) {
                    console.log('Passed business logic')
                    // Make sure to update the correct presentation result
                    if (inputDescriptors[i].name === key) {
                      successFlag = true

                      // Set check result to true
                      const list = contact.Traveler.dataValues.proof_result_list.presentations.map(
                        (item) => {
                          if (Object.keys(item).join() === key) {
                            item[key].result = true
                            item[key].presentation = attributes
                          }
                          return item
                        },
                      )

                      let finalList = {}
                      finalList.presentations = list

                      // Update traveler's proof result list
                      await Travelers.updateProofResultList(
                        contact.contact_id,
                        finalList,
                      )
                    }
                    // (eldersonar) Break out of outer loop if successfully processed validation
                    if (successFlag) {
                      console.log('break')
                      break
                    }
                  } else {
                    console.log('Failed business logic')

                    // Make sure to update the correct presentation result
                    if (inputDescriptors[i].name === key) {
                      successFlag = true

                      // Set check result to false
                      const list = contact.Traveler.dataValues.proof_result_list.presentations.map(
                        (item) => {
                          if (Object.keys(item)[0] === key) {
                            item[key].result = false
                            item[key].presentation = attributes
                          }
                          return item
                        },
                      )

                      let finalList = {}
                      finalList.presentations = list

                      // Update traveler's proof result list
                      await Travelers.updateProofResultList(
                        contact.contact_id,
                        finalList,
                      )
                    }
                  }
                  // (eldersonar) Break out of outer loop if successfully processed validation
                  if (successFlag) {
                    console.log('break')
                    break
                  }
                }

                // Get updated contact
                const updatedContact = await Contacts.getContactByConnection(
                  message.connection_id,
                  ['Traveler'],
                )

                // (eldersonar) Further validation of presentations. Issue a single trusted traveler based on presentation options

                // (eldersonar) Handling the lab result and vaccination presentations
                if (
                  updatedContact.Traveler.dataValues.proof_result_list
                    .presentations.length === 2
                ) {
                  let results = []

                  for (
                    let v = 0;
                    v <
                    updatedContact.Traveler.dataValues.proof_result_list
                      .presentations.length;
                    v++
                  ) {
                    if (
                      updatedContact.Traveler.dataValues.proof_result_list
                        .presentations[v].Lab_Result &&
                      updatedContact.Traveler.dataValues.proof_result_list
                        .presentations[v].Lab_Result.result === true
                    ) {
                      results.push(true)
                    } else if (
                      updatedContact.Traveler.dataValues.proof_result_list
                        .presentations[v].Lab_Result &&
                      updatedContact.Traveler.dataValues.proof_result_list
                        .presentations[v].Lab_Result.result === false
                    ) {
                      results.push(false)
                    } else if (
                      updatedContact.Traveler.dataValues.proof_result_list
                        .presentations[v].Vaccination &&
                      updatedContact.Traveler.dataValues.proof_result_list
                        .presentations[v].Vaccination.result === true
                    ) {
                      results.push(true)
                    } else if (
                      updatedContact.Traveler.dataValues.proof_result_list
                        .presentations[v].Vaccination &&
                      updatedContact.Traveler.dataValues.proof_result_list
                        .presentations[v].Vaccination.result === false
                    ) {
                      results.push(false)
                    }
                  }

                  if (results[0] === true && results[1] === true) {
                    console.log('')
                    console.log(
                      'it passed for regular (non-nested) presentation definition',
                    )
                    console.log('')

                    console.log('Issuing trusted traveler credential.')

                    credentialVerifiedAttributes = credentialAttributes
                    let schema_id = ''

                    // (eldersonar) Validate the privileges
                    if (
                      governance &&
                      privileges.includes('issue_trusted_traveler')
                    ) {
                      for (let i = 0; i < governance.actions.length; i++) {
                        // (eldersonar) Get schema id for trusted traveler
                        if (
                          governance.actions[i].name ===
                          'issue_trusted_traveler'
                        ) {
                          schema_id = governance.actions[i].details.schema
                        }
                      }

                      // (eldersonar) Get schema information
                      if (credentialVerifiedAttributes !== null) {
                        let newCredential = {
                          connectionID: message.connection_id,
                          schemaID: schema_id,
                          schemaVersion: schema_id.split(':')[3],
                          schemaName: schema_id.split(':')[2],
                          schemaIssuerDID: schema_id.split(':')[0],
                          comment: '',
                          attributes: credentialVerifiedAttributes,
                        }

                        // (mikekebert) Request issuance of the trusted_traveler credential
                        console.log('ready to issue trusted traveler')

                        // await Credentials.autoIssueCredential(
                        //   newCredential.connectionID,
                        //   undefined,
                        //   undefined,
                        //   newCredential.schemaID,
                        //   newCredential.schemaVersion,
                        //   newCredential.schemaName,
                        //   newCredential.schemaIssuerDID,
                        //   newCredential.comment,
                        //   newCredential.attributes,
                        // )

                        // Update traveler's verification status
                        await Travelers.updateVerificationStatus(
                          updatedContact.contact_id,
                          true,
                        )

                        credentialVerifiedAttributes = null
                      } else {
                        // (mikekebert) Send a basic message saying the verification was rejected because of business logic
                        console.log('Presentation rejected: 2019-nCoV Detected')
                        await AdminAPI.Connections.sendBasicMessage(
                          message.connection_id,
                          {
                            content: 'INVALID_PROOF',
                          },
                        )

                        // Update traveler's verification status
                        await Travelers.updateVerificationStatus(
                          contact.contact_id,
                          false,
                        )
                      }
                    } else {
                      console.log('no governance or insufficient privileges')
                      await AdminAPI.Connections.sendBasicMessage(
                        message.connection_id,
                        {
                          content: 'INVALID_PRIVILEGES',
                        },
                      )
                    }
                  } else {
                    console.log(
                      "Lab and/or Vaccine didn't pass... OR you've provided only 1 out of 2 presentations",
                    )
                    console.log(results[0])
                    console.log(results[1])

                    if (results[0] === false || results[1] === false) {
                      // Update traveler's verification status
                      await Travelers.updateVerificationStatus(
                        contact.contact_id,
                        false,
                      )
                    }
                  }
                  // (eldersonar) Handling the lab result presentation only
                } else {
                  console.log('Just the Lab')
                  if (
                    updatedContact.Traveler.dataValues.proof_result_list
                      .presentations[0].Lab_Result.result === true
                  ) {
                    console.log('')
                    console.log('it passed for nested presentation definition')
                    console.log('')

                    console.log('Issuing trusted traveler credential.')

                    credentialVerifiedAttributes = credentialAttributes
                    let schema_id = ''

                    // (eldersonar) Validate the privileges
                    if (
                      governance &&
                      privileges.includes('issue_trusted_traveler')
                    ) {
                      for (let i = 0; i < governance.actions.length; i++) {
                        // (eldersonar) Get schema id for trusted traveler
                        if (
                          governance.actions[i].name ===
                          'issue_trusted_traveler'
                        ) {
                          schema_id = governance.actions[i].details.schema
                        }
                      }

                      // (eldersonar) Get schema information
                      if (credentialVerifiedAttributes !== null) {
                        let newCredential = {
                          connectionID: message.connection_id,
                          schemaID: schema_id,
                          schemaVersion: schema_id.split(':')[3],
                          schemaName: schema_id.split(':')[2],
                          schemaIssuerDID: schema_id.split(':')[0],
                          comment: '',
                          attributes: credentialVerifiedAttributes,
                        }

                        // (mikekebert) Request issuance of the trusted_traveler credential
                        console.log('ready to issue trusted traveler')

                        // await Credentials.autoIssueCredential(
                        //   newCredential.connectionID,
                        //   undefined,
                        //   undefined,
                        //   newCredential.schemaID,
                        //   newCredential.schemaVersion,
                        //   newCredential.schemaName,
                        //   newCredential.schemaIssuerDID,
                        //   newCredential.comment,
                        //   newCredential.attributes,
                        // )

                        // Update traveler's verification status
                        await Travelers.updateVerificationStatus(
                          updatedContact.contact_id,
                          true,
                        )

                        credentialVerifiedAttributes = null
                      } else {
                        // (mikekebert) Send a basic message saying the verification was rejected because of business logic
                        await AdminAPI.Connections.sendBasicMessage(
                          message.connection_id,
                          {
                            content: 'INVALID_PROOF',
                          },
                        )

                        // Update traveler's verification status
                        await Travelers.updateVerificationStatus(
                          contact.contact_id,
                          false,
                        )
                      }
                    } else {
                      console.log('no governance or insificient privilieges')
                      await AdminAPI.Connections.sendBasicMessage(
                        message.connection_id,
                        {
                          content: 'INVALID_PRIVILEGES',
                        },
                      )
                    }
                  } else {
                    console.log("Lab didn't pass...")

                    // Update traveler's verification status
                    await Travelers.updateVerificationStatus(
                      contact.contact_id,
                      false,
                    )
                  }
                }
              } else {
                console.log('')
                console.log('One or all the field comparison attempts failed.')
                console.log(
                  "The field comparison attempts failed while looping through input descriptor list. It can be just wrong descriptor or the list of attributes from the correct proof and fields from input descriptor didn't match.",
                )
                console.log('')
              }
            }

            // Handle nested submission requirements validation
          } else {
            console.log(
              '...........Handling nested submission requrements validation.................',
            )

            // TODO: fix this not to trigger issuing from_nested.length * credentials
            for (
              let g = 0;
              g <
              pdf.presentation_definition.submission_requirements[0].from_nested
                .length;
              g++
            ) {
              let chosenDescriptors = []

              // Get nested descriptors
              for (let f = 0; f < inputDescriptors.length; f++) {
                if (
                  inputDescriptors[f].group.includes(
                    pdf.presentation_definition.submission_requirements[0]
                      .from_nested[g].from,
                  )
                ) {
                  chosenDescriptors.push(inputDescriptors[f])
                }
              }

              console.log('these are the chosen descriptors')
              console.log(g)
              console.log(chosenDescriptors)

              for (let i = 0; i < chosenDescriptors.length; i++) {
                console.log('')
                console.log(
                  `Comparing proof with ${chosenDescriptors[i].name} input descriptor`,
                )
                console.log('')

                let fields = []
                let proofResult = false

                let fieldsValidationResult = false

                // (eldersonar) Execute if there are any of input descriptors match the submission requirements group value
                if (
                  chosenDescriptors[i].group.includes(
                    pdf.presentation_definition.submission_requirements[0]
                      .from_nested[g].from,
                  )
                ) {
                  // Get an array of attributes
                  for (
                    let j = 0;
                    j < chosenDescriptors[i].constraints.fields.length;
                    j++
                  ) {
                    const fieldPath = chosenDescriptors[i].constraints.fields[
                      j
                    ].path
                      .join('')
                      .split('$.')[1] // (eldersonar) TODO: turn into a loop. This will be not valid if have more than 1 path in the array

                    fields.push(fieldPath)
                  }
                }

                // (eldersonar) Get and sort the list of proof attributes and descriptor fields
                const proofAttributeKeys = Object.keys(attributes)
                const proofPredicateKeys = Object.keys(predicates)
                const predicatesAndArrays = proofAttributeKeys.concat(
                  proofPredicateKeys,
                )
                const sortedProofFields = predicatesAndArrays.sort(function (
                  a,
                  b,
                ) {
                  return a.localeCompare(b)
                })
                const sortedDescriptorFields = fields.sort(function (a, b) {
                  return a.localeCompare(b)
                })

                // (eldersonar) Start validation
                if (sortedProofFields.length && sortedDescriptorFields.length) {
                  // (eldersonar) Check if there is no array match (no credential match or no predicate match)
                  if (
                    JSON.stringify(sortedProofFields) !=
                    JSON.stringify(sortedDescriptorFields)
                  ) {
                    console.log('comparison failed')

                    // (eldersonar) Get leftover fields with the filter
                    let nonDuplicateFields = sortedProofFields.filter(
                      (val) => !sortedDescriptorFields.includes(val),
                    )

                    for (
                      let k = 0;
                      k < chosenDescriptors[i].constraints.fields.length;
                      k++
                    ) {
                      // (eldersonar) Check if input descriptor has in-field conditional logic
                      if (
                        chosenDescriptors[i].constraints.fields[k].filter.oneOf
                      ) {
                        for (
                          let l = 0;
                          l <
                          chosenDescriptors[i].constraints.fields[k].filter
                            .oneOf.length;
                          l++
                        ) {
                          for (let m = 0; m < nonDuplicateFields.length; m++) {
                            const prefix = '$.'
                            let lookupField = ''
                            lookupField += prefix
                            lookupField += nonDuplicateFields[m]

                            // (eldersonar) If we can find the field name in the list of in-field predicates
                            if (
                              chosenDescriptors[i].constraints.fields[
                                k
                              ].filter.oneOf[
                                l
                              ].dependent_fields[0].path.includes(lookupField)
                            ) {
                              // (eldersonar) Removing predicate from the list of sorted fields
                              const index = sortedProofFields.indexOf(
                                nonDuplicateFields[m],
                              )
                              if (index > -1) {
                                sortedProofFields.splice(index, 1)
                              }

                              console.log(sortedProofFields)
                              console.log(sortedDescriptorFields)
                              console.log(
                                JSON.stringify(sortedProofFields) ===
                                JSON.stringify(sortedDescriptorFields),
                              )

                              // (eldersonar) Check if arrays match after the predicates were removed
                              if (
                                JSON.stringify(sortedProofFields) ===
                                JSON.stringify(sortedDescriptorFields)
                              ) {
                                console.log('')
                                console.log(
                                  '_____________________________________________',
                                )
                                console.log(
                                  'Validation of proof was successful.',
                                )

                                fieldsValidationResult = validateFieldByField(
                                  attributes,
                                  chosenDescriptors[i],
                                )

                                proofResult = true
                              } else {
                                // console.log("Validation failed.")
                                proofResult = false
                              }
                            } else {
                              // console.log("Validation failed. No match was found.")
                              proofResult = false
                            }
                          }
                        }
                      }
                    }
                  }
                  // (eldersonar) Perfect match, proof fields are validated!
                  else {
                    console.log('')
                    console.log('_____________________________________________')
                    console.log('Validation of proof was successful.')

                    // (eldersonar) Value validation happens here
                    fieldsValidationResult = validateFieldByField(
                      attributes,
                      chosenDescriptors[i],
                    )

                    proofResult = true
                  }
                } else {
                  console.log('Error: lacking data for validation')
                }

                console.log(proofResult)
                console.log(fieldsValidationResult)
                console.log(chosenDescriptors[i].name)

                // // Update traveler's verification status
                // await Travelers.updateProofResultList(contact.contact_id, list)

                // Check if all level validation passed
                if (proofResult && fieldsValidationResult) {
                  console.log('')
                  console.log('it passed 2')
                  console.log('')
                  console.log('')

                  // --------------------------- Handling and storing success -------------------------
                  console.log('Original presentations array')
                  console.log('')
                  console.log(
                    contact.Traveler.dataValues.proof_result_list.presentations,
                  )
                  console.log('')

                  let successFlag = null

                  for (
                    let x = 0;
                    x <
                    contact.Traveler.dataValues.proof_result_list.presentations
                      .length;
                    x++
                  ) {
                    console.log(
                      contact.Traveler.dataValues.proof_result_list
                        .presentations[x],
                    )

                    // // Get all the object keys
                    let keys = Object.keys(
                      contact.Traveler.dataValues.proof_result_list
                        .presentations[x],
                    )

                    // (eldersonar) TODO: Locate and remove redundant code here
                    let listElement = {
                      [inputDescriptors[i].name]: {
                        result: true,
                        presentation: {},
                      },
                    }

                    console.log('listElement')
                    console.log(listElement)

                    // // Proof object reasignment
                    let proofList =
                      contact.Traveler.dataValues.proof_result_list
                        .presentations[x]

                    console.log('proofList')
                    console.log(proofList)

                    // Keys to string
                    let key = keys.join()

                    console.log('key')
                    console.log(key)

                    // (eldersonar) Check if we are updating correct proof element
                    if (inputDescriptors[i].name === key) {
                      successFlag = true
                      proofList[keys[0]] = listElement[keys[0]]
                      // Same thing but handles muliple keys
                      // keys.map(y => {
                      //   proofList[y] = listElement[y]
                      //   console.log("map magic")
                      //   console.log(proofList[y])
                      // })
                    }

                    console.log('proofList')
                    console.log(proofList)

                    // console.log("this is an updated list")
                    // console.log(proofList)

                    // Proof result list (presentation ) shallow copy
                    let presentations = [
                      ...contact.Traveler.dataValues.proof_result_list
                        .presentations,
                    ]

                    console.log('presentations')
                    console.log(presentations)

                    // Rebuilding object list
                    presentations.presentations = proofList[x]

                    console.log('presentations')
                    console.log(presentations)

                    // Set check result to true
                    const list = presentations.map((item) => {
                      if (Object.keys(item) === key) {
                        item.result = true
                      }
                      return item
                    })

                    console.log('list')
                    console.log(list)

                    let finalList = {}
                    finalList.presentations = list

                    // Update traveler's proof result list
                    await Travelers.updateProofResultList(
                      contact.contact_id,
                      finalList,
                    )

                    // Break out of outer loop if successfully passed val
                    if (successFlag) {
                      console.log('break')
                      break
                    }
                  }

                  // --------------------------- Handling and storing success -------------------------

                  console.log('Issuing trusted traveler credential.')

                  credentialVerifiedAttributes = credentialAttributes
                  let schema_id = ''

                  // (eldersonar) Validate the privileges
                  if (
                    governance &&
                    privileges.includes('issue_trusted_traveler')
                  ) {
                    for (let i = 0; i < governance.actions.length; i++) {
                      // (eldersonar) Get schema id for trusted traveler
                      if (
                        governance.actions[i].name === 'issue_trusted_traveler'
                      ) {
                        schema_id = governance.actions[i].details.schema
                      }
                    }

                    // (eldersonar) Get schema information
                    if (credentialVerifiedAttributes !== null) {
                      let newCredential = {
                        connectionID: message.connection_id,
                        schemaID: schema_id,
                        schemaVersion: schema_id.split(':')[3],
                        schemaName: schema_id.split(':')[2],
                        schemaIssuerDID: schema_id.split(':')[0],
                        comment: '',
                        attributes: credentialVerifiedAttributes,
                      }

                      // (mikekebert) Request issuance of the trusted_traveler credential
                      console.log('ready to issue trusted traveler')

                      // await Credentials.autoIssueCredential(
                      //   newCredential.connectionID,
                      //   undefined,
                      //   undefined,
                      //   newCredential.schemaID,
                      //   newCredential.schemaVersion,
                      //   newCredential.schemaName,
                      //   newCredential.schemaIssuerDID,
                      //   newCredential.comment,
                      //   newCredential.attributes,
                      // )

                      // Update traveler's verification status
                      await Travelers.updateVerificationStatus(
                        contact.contact_id,
                        true,
                      )

                      credentialVerifiedAttributes = null
                    } else {
                      // (mikekebert) Send a basic message saying the verification was rejected because of business logic
                      console.log('Presentation rejected: 2019-nCoV Detected')
                      await AdminAPI.Connections.sendBasicMessage(
                        message.connection_id,
                        {
                          content: 'INVALID_PROOF',
                        },
                      )

                      // Update traveler's verification status
                      await Travelers.updateVerificationStatus(
                        contact.contact_id,
                        false,
                      )
                    }
                  } else {
                    console.log('no governance or insufficient privilieges')
                    await AdminAPI.Connections.sendBasicMessage(
                      message.connection_id,
                      {
                        content: 'INVALID_PRIVILEGES',
                      },
                    )
                  }

                  // (eldersonar) Validation failed
                } else {
                  console.log('')
                  console.log('The field comparison failed.')
                  console.log('')
                }
              }
            }
          }
        }
      }
    } else if (message.verified === 'true' && !participantValidated && (
      (!message.presentation.requested_proof.self_attested_attrs &&
        !Object.keys(message.presentation.requested_proof.self_attested_attrs)
          .length))) {
      // (eldersonar) Send a basic message
      console.log("I'm here")
      console.log(message.state)
      console.log(message.verified)
      await AdminAPI.Connections.sendBasicMessage(message.connection_id, {
        content:
          "We're sorry, but we don't currently recognize the issuer of your credential and cannot approve it at this time.",
      })
      // (eldersonar) Handle passport and travelers
    } else {
      console.log("self-attested")
      // }
      // else {

      // (eldersonar) Get contact id
      let contact = await Contacts.getContactByConnection(message.connection_id, [])
      console.log("----this is the contact_id ----")
      console.log("contact id is: " + contact.contact_id)

      // (edersonar) Create travelers
      await Demographics.updateOrCreateDemographic(
        contact.contact_id,
        message.presentation.requested_proof.self_attested_attrs.email,
        message.presentation.requested_proof.self_attested_attrs.phone,
        message.presentation.requested_proof.self_attested_attrs.street_address,
        message.presentation.requested_proof.self_attested_attrs.city,
        message.presentation.requested_proof.self_attested_attrs.state_province_region,
        message.presentation.requested_proof.self_attested_attrs.postalcode,
        message.presentation.requested_proof.self_attested_attrs.country,
      )

      // (eldersonar) Create passport
      await Passports.updateOrCreatePassport(
        contact.contact_id,
        message.presentation.requested_proof.self_attested_attrs.passport_number,
        message.presentation.requested_proof.self_attested_attrs.surname,
        message.presentation.requested_proof.self_attested_attrs.given_names,
        message.presentation.requested_proof.self_attested_attrs.sex,
        message.presentation.requested_proof.self_attested_attrs.date_of_birth,
        message.presentation.requested_proof.self_attested_attrs.place_of_birth,
        message.presentation.requested_proof.self_attested_attrs.nationality,
        message.presentation.requested_proof.self_attested_attrs.date_of_issue,
        message.presentation.requested_proof.self_attested_attrs.date_of_expiration,
        message.presentation.requested_proof.self_attested_attrs.type,
        message.presentation.requested_proof.self_attested_attrs.issuing_country,
        message.presentation.requested_proof.self_attested_attrs.authority,
        message.presentation.requested_proof.self_attested_attrs.photo,
      )
    }
  } else if (message.state === null) {
    // (mikekebert) Send a basic message saying the verification failed for technical reasons
    console.log('Validation failed for technical reasons')
    await AdminAPI.Connections.sendBasicMessage(message.connection_id, {
      content: 'UNVERIFIED',
    })
  } else {
  }
}

const createPresentationReports = async (presentation) => {
  try {
    const presentationReport = await Presentations.createPresentationReports(
      presentation.presentation_exchange_id,
      presentation.trace,
      presentation.connection_id,
      presentation.role,
      presentation.created_at,
      presentation.updated_at,
      JSON.stringify(presentation.presentation_request_dict),
      presentation.initiator,
      JSON.stringify(presentation.presentation_request),
      presentation.state,
      presentation.thread_id,
      presentation.auto_present,
      JSON.stringify(presentation.presentation),
    )

    // Broadcast the message to all connections
    Websockets.sendMessageToAll('PRESENTATIONS', 'PRESENTATION_REPORTS', {
      presentation_reports: [presentationReport],
    })
  } catch (error) {
    console.log('Error creating presentation reports:')
    throw error
  }
}

const updatePresentationReports = async (presentation) => {
  try {
    const presentationReport = await Presentations.updatePresentationReports(
      presentation.presentation_exchange_id,
      presentation.trace,
      presentation.connection_id,
      presentation.role,
      presentation.created_at,
      presentation.updated_at,
      JSON.stringify(presentation.presentation_request_dict),
      presentation.initiator,
      JSON.stringify(presentation.presentation_request),
      presentation.state,
      presentation.thread_id,
      presentation.auto_present,
      JSON.stringify(presentation.presentation),
    )

    // Broadcast the message to all connections
    Websockets.sendMessageToAll('PRESENTATIONS', 'PRESENTATION_REPORTS', {
      presentation_reports: [presentationReport],
    })
  } catch (error) {
    console.log('Error updating presentation reports:')
    throw error
  }
}

const getAll = async () => {
  try {
    console.log('Fetching presentation reports!')
    const presentationReports = await Presentations.readPresentations()

    return presentationReports
  } catch (error) {
    console.log('Error fetching presentation reports:')
    throw error
  }
}

module.exports = {
  adminMessage,
  requestPresentation,
  requestIdentityPresentation,
  createPresentationReports,
  updatePresentationReports,
  getAll,
}